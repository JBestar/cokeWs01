const WebSocket = require('ws')
const md5 = require('md5');
var Mutex = require('async-mutex').Mutex;

module.exports = class LoServer{
    constructor(){
        this.server = new WebSocket.Server({ noServer: true });
        this.packMap = new Map();
        this.info = {tmPack:Date.now(), lockMap:new Map()};
        this.create();
    }

    create() {
        
        var server = this.server;
        var pack = null;
        mCommon.log("==================START==================", true);

        server.on('connection', client => {

            client.session = mCommon.randString(32);
            client.isLogin = false;
            client.openAt = Date.now(); 
            client.on('message', message => {
                if(client.isLogin)
                    mCommon.log(`${client.member.mb_uid} => ${message}`);
                else 
                    mCommon.log(`${client.session} => ${message}`);

                try {
					pack = JSON.parse(message);
					
                    switch(pack.type){
                        case mCommon.pk.LoginRequest:
                            this.onLoginRequest(client, pack);
                            break;
                        case mCommon.pk.SetMasterRequest:
                            this.onSetMasterRequest(client, pack);
                            break;
                        // case mCommon.pk.OnEnterTableRequest:
                        //     this.onEnterTableRequest(client, pack);
                        //     break;
                        case mCommon.pk.OnMsgResponse:
                            this.onMsgResponse(client, pack);
                            break;
                        case mCommon.pk.OnBettingRequest:
                            this.onBettingRequest(client, pack);
                            break;
                        case mCommon.pk.MetricsPing:
                            this.onMetricsPing(client);
                            break;
                        default:break;
                    }
                } catch(e){
                    mCommon.log(`<OnMessage> (${client.session}) error : ${e}`, true);
                }

            });
            
            client.on('close', (code, msg) => {
                mCommon.log(`<OnClose> (${client.session}) Closed : code=${code}, msg=${msg}`, true);
                this.onClientClosed(client, code);
            });

        });
        
        setInterval( async () => {

            let tmNow = Date.now(); 
            let loginClients = [];
            let closeClients = [];

            if(tmNow - this.info.tmPack > 120000){
                this.info.tmPack = tmNow;
                this.procPackMap();

                mCommon.log(`<Interval> Connect Cnt=${server.clients.size}`, true);
            }

            for(let client of server.clients) {

                if(tmNow - client.openAt < 10000 )
                    return;

                if(client.isLogin){
                    if(tmNow - client.member.updated > 300000){
                        client.isLogin = false;
                        mCommon.log(`<Interval> (${client.session}) Closing : No Update `, false, true); 

                    } else {
                        loginClients.push(client);
                        mCommon.log(`<Interval> (${client.session}) mb_uid=${client.member.mb_uid} (${client.member.category})`); 
                    }

                } else {
                    closeClients.push(client);
                    mCommon.log(`<Interval> (${client.session}) Closed : No Login`, false, true); 
                }
            };

            if(closeClients.length > 0){
                closeClients.forEach(function(client){
                    client.close();
                });
            }

            if(loginClients.length > 0){

                let clientMap = new Map();
                let clientArr = null;
                let cat = "";
                for(let client of loginClients) {
                    
                    if(cat !== client.member.category){
                        if(cat.length > 0)
                            clientMap.set(cat, clientArr); 
                        clientArr = [];
                        cat = client.member.category
                    }
                    clientArr.push(client);
                }
                clientMap.set(cat, clientArr); 

                clientMap.forEach(async (clientArr, cat) => {

                    let sessIds = [];
                    for(let client of clientArr) {
                        sessIds.push(client.member.sess_id);
                    }
                    let arrSess = await gModel.sess.getByIds(cat, sessIds);

                    let clientSess = null;
                    for(let client of clientArr) {

                        clientSess = null;
                        if(client.member && arrSess && arrSess.length > 0){
                            for(let sess of arrSess) {
                                if(sess.sess_id === client.member.sess_id){
                                    clientSess = sess;
                                    break;
                                }
                            }
                        }
                        
                        if(!clientSess){
                            mCommon.log(`<Interval> (${client.session}) Closing : DbSess is NULL `, true); 
                            client.isLogin = false;
                        } else {
                            let tmLast = new Date(clientSess.sess_time_last).getTime();
                            if(tmNow - tmLast > 300000){
                                client.isLogin = false;
                                mCommon.log(`<Interval> (${client.session}) Closing : DbSess No Update `, true); 
                            }
                        }

                    }
                    
                });
            }

        }, 30000);
        
    }

    async onClientClosed(client, closeCode){
        if(!client.member)
            return;
        
        if(closeCode != 1006){
            this.clearPackMap(client);
        }

        let uid = client.member.mb_uid;
        let result = mCommon.def.STATUS_FAIL;
        let code = mCommon.def.CODE_OUT;

        let resArgs = {result:result, code:code};
        let objPack = mCommon.makePack(mCommon.pk.MasterStateChanged, resArgs);
        let sendMsg = JSON.stringify(objPack);
        this.sendMsgToSlave(objPack.id, sendMsg, client.member.category, uid, false, true);

    }

    async sendMsgToSlave(msgId, msg, category, master, save=false, log=false){
            
        var clients = this.server.clients;

        for(let client of clients){
            if(client.readyState !== WebSocket.OPEN)
                continue;
            if(!client.isLogin)
                continue;

            if(client.member.master === master && client.member.category === category){
                if(log)
                    mCommon.log(`<SendMsgToSlave> (${client.session}) ${client.member.mb_uid} <== ${msg}`);

                if(save){
                    this.pushPackMap(client, msgId, msg);
                }

                client.send(msg);
            }
        }
    }

    async onMetricsPing(client){
        client.member.updated = Date.now();
        
        let args = {t: mCommon.tmStamp(Date.now())};
        let objPack = mCommon.makePack(mCommon.pk.MetricsPong, args);
        let sendMsg = JSON.stringify(objPack);
        client.send(sendMsg);
    }

    
    async onLoginRequest(client, pack){
        let args = pack.args;
        if(args.game !== undefined){
            let result = mCommon.def.STATUS_FAIL, code = mCommon.def.CODE_FAIL;

            let category = await gModel.category.getByName(args.game);
            if(!category){
                result = mCommon.def.STATUS_FAIL;
                code = mCommon.def.CODE_STOP;
            } else {
                let sess = await gModel.sess.getById(args.game, args.session);
                if(!sess) {
                    mCommon.log(`<${mCommon.pk.LoginRequest}> (${client.session}) db_sess=${args.session} Null `, true); 
                    result = mCommon.def.STATUS_FAIL;
                    code = mCommon.def.CODE_FAIL;
                } else if(this.isExistId(category.cat_name, sess.sess_id, sess.sess_mb_uid)) {
                    mCommon.log(`<${mCommon.pk.LoginRequest}> (${client.session}) mb_uid=${sess.sess_mb_uid}, db_sess=${sess.sess_id} ExistId `, true); 
                    result = mCommon.def.STATUS_FAIL;
                    code = mCommon.def.CODE_DUPL;
                } else {
                    mCommon.log(`<${mCommon.pk.LoginRequest}> (${client.session}) mb_uid==${sess.sess_mb_uid}, db_sess=${sess.sess_id} Success `, true); 
                    client.isLogin = true;
                    client.member = {sess_id:sess.sess_id, mb_uid:sess.sess_mb_uid, master:"", category:category.cat_name, tableId:"", updated:Date.now()};
                    result = mCommon.def.STATUS_SUCCESS;
                    code = mCommon.def.CODE_OK;

                    this.createPackMap(client);
                }
            }

            let resArgs = {result:result, code:code};
            let objPack = mCommon.makePack(mCommon.pk.LoginResponse, resArgs);
            let sendMsg = JSON.stringify(objPack);
            client.send(sendMsg);

            if(client.isLogin){

                objPack = mCommon.makePack(mCommon.pk.MasterStateChanged, resArgs);
                sendMsg = JSON.stringify(objPack);
                this.sendMsgToSlave(objPack.id, sendMsg, client.member.category, client.member.mb_uid, false, true);
            }

        }
    }

    async createPackMap(client){
        
        let member = client.member;
        if(!member)
            return;

        try {

            let categoryLock = null;
            if(this.info.lockMap.has(member.category)){
                categoryLock = this.info.lockMap.get(member.category);
            } else {
                categoryLock = new Map();
                this.info.lockMap.set(member.category, categoryLock)
            }

            let memberLock = null;
            if(categoryLock.has(member.mb_uid)){
                memberLock = categoryLock.get(member.mb_uid);
            } else {
                memberLock = new Mutex();
                categoryLock.set(member.mb_uid, memberLock);
            }

            let categoryPack = null;
            if(this.packMap.has(member.category)){
                categoryPack = this.packMap.get(member.category); 
            } else{
                categoryPack = new Map();
                this.packMap.set(member.category, categoryPack);
            }

            let memberPack = null;
            if(!categoryPack.has(member.mb_uid)){
                memberPack = new Map();
                categoryPack.set(member.mb_uid, memberPack);
            } else {
                memberPack = categoryPack.get(member.mb_uid); 

                let msgs = [];
                if(memberPack.size > 0){
                    let releaseLock = null;
                    try {
                        releaseLock = await memberLock.acquire();
                            for (let [id, objPack] of memberPack) {
                                if(!objPack.delete){
                                    objPack.delete = true;
                                    msgs.push(`${objPack.msg}`);
                                }
                            }
                        } catch(err) {
                            mCommon.log(`<createPackMap> (${client.session}) mb_uid=${member.mb_uid} lock error : ${e}`, true);
                        } finally {
                            releaseLock();
                        }
                }

                if(msgs.length > 0){

                    for(let msg of msgs)
                        client.send(msg);
                }

            } 
        } catch(e){
            mCommon.log(`<createPackMap> (${client.session}) mb_uid=${member.mb_uid} error : ${e}`, true);
        }

    }

    pushPackMap(client, id, msg){

        let member = client.member;
        if(!member)
            return;

        try {

            let categoryPack = null;
            if(this.packMap.has(member.category)){
                categoryPack = this.packMap.get(member.category); 
            } else return;

            let memberPack = null;
            if(categoryPack.has(member.mb_uid)){
                memberPack = categoryPack.get(member.mb_uid); 
            } else return;

            let tmNow = Date.now();
            memberPack.set(id, {msg:msg, time:tmNow, delete:false});

        } catch(e){
            mCommon.log(`<pushPackMap> (${client.session}) mb_uid=${member.mb_uid} error : ${e}`, true);
        }
    }

    popPackMap(client, id){

        let member = client.member;
        if(!member)
            return;

        try {

            let categoryPack = null;
            if(this.packMap.has(member.category)){
                categoryPack = this.packMap.get(member.category); 
            } else return;

            let memberPack = null;
            if(categoryPack.has(member.mb_uid)){
                memberPack = categoryPack.get(member.mb_uid); 
            } else return;

            // mCommon.log(`<popPackMap> (${client.session}) mb_uid=${member.mb_uid} id=${id}`);

            let objPack = memberPack.get(id);
            if(objPack){
                objPack.delete = true;
                // mCommon.log(`<popPackMap> (${client.session}) objPack = ${JSON.stringify(objPack)}`);
            }
            
        } catch(e){
            mCommon.log(`<popPackMap> (${client.session}) mb_uid=${member.mb_uid} error : ${e}`, true);
        }
    }

    async clearPackMap(client){

        function clearPack(memberPack){
            for (let [id, objPack] of memberPack) {
                objPack.delete = true;
            }
        }

        let member = client.member;
        if(!member)
            return;

        try {

            let categoryPack = null;
            if(this.packMap.has(member.category)){
                categoryPack = this.packMap.get(member.category); 
            } else return;

            let memberPack = null;
            if(categoryPack.has(member.mb_uid)){
                memberPack = categoryPack.get(member.mb_uid); 
            } else return;

            if(memberPack.size < 1)
                return;

            let memberLock = this.getMemberLock(member.category, member.mb_uid);

            if(memberLock){
                let releaseLock = null;
                try {
                        releaseLock = await memberLock.acquire();
                        clearPack(memberPack);
                    } catch(err) {
                        mCommon.log(`<clearPackMap> (${client.session}) mb_uid=${member.mb_uid} lock error : ${e}`, true);
                    } finally {
                        releaseLock();
                    }
            } else {
                clearPack(memberPack);
            }

        } catch(e){
            mCommon.log(`<clearPackMap> (${client.session}) mb_uid=${member.mb_uid} error : ${e}`, true);
        }
    }

    async procPackMap(){

        function procPack(memberPack){
            let cnt = 0;

            try {

                let deleteIds = [];
                for (let [pid, objPack] of memberPack) {

                    // mCommon.log(`<procPackMap> pack = ${JSON.stringify(objPack)}`);

                    if(objPack.delete)
                        deleteIds.push(pid);
                    else if(tmNow - objPack.time > 600000){
                        deleteIds.push(pid);
                    }
                    cnt ++;
                }
                if(deleteIds.length > 0){
                    for(let pid of deleteIds){
                        memberPack.delete(pid);
                    }
                }
            } catch(e){
                mCommon.log(`<procPackMap> error : ${e}`, true);
            }
            return cnt;
        }

        let tmNow = Date.now();
        let cnt = 0;
        for (let [cid, categoryPack] of this.packMap) {
            for (let [mid, memberPack] of categoryPack) {

                let memberLock = this.getMemberLock(cid, mid);
                if(memberLock){
                    let releaseLock = null;
                    try {
                            releaseLock = await memberLock.acquire();
                            cnt += procPack(memberPack);
                        } catch(err) {
                            mCommon.log(`<procPackMap> (${client.session}) mb_uid=${member.mb_uid} lock error : ${e}`, true);
                        } finally {
                            releaseLock();
                        }
                } else {
                    cnt += procPack(memberPack);
                }
            }    
        }
        mCommon.log(`<procPackMap> size = ${cnt}`, true);
        
    }

    getMemberLock(category, mb_uid){
        
        let memberLock = null;
        let categoryLock = this.info.lockMap.get(category);
        if(categoryLock)
            memberLock = categoryLock.get(mb_uid);
        return memberLock;
    }

    async onSetMasterRequest(client, pack){
        let args = pack.args;

        args.masterId = args.masterId.trim();
        let result = mCommon.def.STATUS_FAIL, code = mCommon.def.CODE_FAIL;

        let masterMember = null;
        if(!client.isLogin){
            result = mCommon.def.STATUS_FAIL;
            code = mCommon.def.CODE_OUT;
        } else if(args.masterId){
            let member = await gModel.member.getByUid(client.member.category, args.masterId);
            if(args.masterId === client.member.mb_uid){
                result = mCommon.def.STATUS_FAIL;
                code = mCommon.def.CODE_ERROR;   //no master
            } else if(!member){
                result = mCommon.def.STATUS_FAIL;
                code = mCommon.def.CODE_ERROR;   //no master
            } else {
                client.member.master = args.masterId;

                masterMember = this.getExistMember(client.member.category, args.masterId);
                if(!masterMember || masterMember.master.length > 0){
                    result = mCommon.def.STATUS_FAIL;
                    code = mCommon.def.CODE_OUT;

                } else {
                    result = mCommon.def.STATUS_SUCCESS;
                    code = mCommon.def.CODE_OK;
                }
            }
            
        }
        let resArgs = {result:result, code:code};
        
        let objPack = mCommon.makePack(mCommon.pk.SetMasterResponse, resArgs);
        let sendMsg = JSON.stringify(objPack);
        client.send(sendMsg);
    }
    
    async onEnterTableRequest(client, pack){
        let args = pack.args;
        
        if(client.isLogin && args.tableId !== undefined){
            args.tableId = args.tableId.trim();
            client.member.tableId = args.tableId;
            let resArgs = {tableId:args.tableId};
                
            let objPack = mCommon.makePack(mCommon.pk.OnEnterTableResponse, resArgs);
            let sendMsg = JSON.stringify(objPack);
            this.sendMsgToSlave(objPack.id, sendMsg, client.member.category, client.member.mb_uid, true, true);
    
        }
    }

    async onBettingRequest(client, pack){
        let args = pack.args;
        
        if(client.isLogin && args.side !== undefined && args.money !== undefined){
            
            let objPack = mCommon.makePack(mCommon.pk.OnBettingResponse, args);
            let sendMsg = JSON.stringify(objPack);
            this.sendMsgToSlave(objPack.id, sendMsg, client.member.category, client.member.mb_uid, true, true);
    
        }
    }

    async onMsgResponse(client, pack){
        
        if(pack.resId !== undefined){
            this.popPackMap(client, pack.resId);
        }
        
    }

    isExistId(category, sess_id, uid){
        var clients = this.server.clients;

        for(let client of clients){
            if(client.readyState !== WebSocket.OPEN)
                continue;
                
            if(! client.isLogin)
                continue;
            
            if(client.member.category == category && client.member.sess_id === sess_id && client.member.mb_uid === uid ){
                return true;
            }
        }
        return false;
    }

    getExistMember(category, uid){
        var clients = this.server.clients;

        let member = null;
        for(let client of clients){
            if(client.readyState !== WebSocket.OPEN)
                continue;
                
            if(! client.isLogin)
                continue;
            
            if(client.member.category == category && client.member.mb_uid === uid ){
                member = client.member;
                break;
            }
        }
        return member;
    }
}