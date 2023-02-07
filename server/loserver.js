const WebSocket = require('ws')
const md5 = require('md5');

module.exports = class LoServer{
    constructor(){
        this.server = new WebSocket.Server({ noServer: true });
        this.create();
    }

    async stop(){
        if(this.server){
            var clients = this.server.clients;
            clients.forEach(async function(client) {
                mCommon.log(`>>Lobby Client: Id:${client.session} Closing...`);
                client.close();

            });
        }
    }

    create() {
        
        var server = this.server;
        var pack = null;
        mCommon.log("==================START==================");

        server.on('connection', client => {

            client.session = mCommon.randString(32);
            client.isLogin = false;
            client.openAt = Date.now(); 
            client.on('message', message => {
                if(client.isLogin)
                    mCommon.log(`${client.member.mb_uid} => ${message}`);
                else 
                    mCommon.log(`${client.session} => ${message}`);

                pack = JSON.parse(message);

                try {
                    switch(pack.type){
                        case mCommon.pk.LoginRequest:
                            this.onLoginRequest(client, pack);
                            break;
                        case mCommon.pk.SetMasterRequest:
                            this.onSetMasterRequest(client, pack);
                            break;
                        case mCommon.pk.OnEnterTableRequest:
                            this.onEnterTableRequest(client, pack);
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
                    mCommon.log(`Lobby Server error : ${e}`);
                }

            });
            
            client.on('close', e => {
                mCommon.log(`Lobby Server Client : ${client.session} Closed`);
                this.onClientClosed(client);
            });

        });
        
        setInterval( async () => {

            var closeClients = [];
            for(let client of server.clients) {

                if(Date.now() - client.openAt < 10000 )
                    return;

                if(client.isLogin){
                    if(Date.now() - client.member.updated > 120000)
                        client.isLogin = false;
                    else mCommon.log(`Connecting: ${client.session} ID: ${client.member.mb_uid}`); 

                } else {
                    closeClients.push(client);
                }
            };

            if(closeClients.length > 0){
                closeClients.forEach(function(client){
                    client.close();
                    mCommon.log(`Client ${client.session} Closed `); 
                });
            }

            mCommon.log(`Connect Cnt: ${server.clients.size}`);
        }, 30000);
        
    }

    async onClientClosed(client){
        if(!client.member)
            return;
        
        let uid = client.member.mb_uid;
        let result = mCommon.def.STATUS_FAIL;
        let code = mCommon.def.CODE_OUT;

        let resArgs = {result:result, code:code};
        let sendPack = mCommon.makePack(mCommon.pk.MasterStateChanged, resArgs);
        
        this.sendMsgToSlave(sendPack, uid, true);

    }

    async sendMsgToSlave(message, master, log=true){
            
        var clients = this.server.clients;

        for(let client of clients){
            if(client.readyState !== WebSocket.OPEN)
                continue;
            if(!client.isLogin)
                continue;
            if(client.member.master === master){
                if(log)
                    mCommon.log(`${client.member.mb_uid} <== ${message}`);
                client.send(message);
            }
        }
    }

    async onMetricsPing(client){
        client.member.updated = Date.now();
        
        let args = {t: mCommon.tmStamp(Date.now())};
        let sendPack = mCommon.makePack(mCommon.pk.MetricsPong, args);
        client.send(sendPack);
    }

    
    async onLoginRequest(client, pack){
        let args = pack.args;
        if(args.game !== undefined){
            let result = mCommon.def.STATUS_FAIL, code = mCommon.def.CODE_FAIL;
            mCommon.log(`${mCommon.pk.LoginRequest}: 1 `); 

            let category = await gModel.category.getByName(args.game);
            mCommon.log(`${mCommon.pk.LoginRequest}: 2 `); 
            if(!category){
                result = mCommon.def.STATUS_FAIL;
                code = mCommon.def.CODE_STOP;
            } else {
                let sess = await gModel.sess.getById(args.game, args.session);
                mCommon.log(`${mCommon.pk.LoginRequest}: 3 `); 
                if(!sess) {
                    mCommon.log(`${mCommon.pk.LoginRequest}: sess=> ${args.session} Null `, true); 
                    result = mCommon.def.STATUS_FAIL;
                    code = mCommon.def.CODE_FAIL;
                } else if(this.isExistId(category.cat_name, sess.sess_mb_uid)) {
                    mCommon.log(`${mCommon.pk.LoginRequest}: mb_uid=> ${sess.sess_mb_uid} ExistId `, true); 
                    result = mCommon.def.STATUS_FAIL;
                    code = mCommon.def.CODE_DUPL;
                } else {
                    mCommon.log(`${mCommon.pk.LoginRequest}: mb_uid=> ${sess.sess_mb_uid} Success `, true); 
                    client.isLogin = true;
                    client.member = {sess_id:sess.sess_id, mb_uid:sess.sess_mb_uid, master:"", category:category.cat_name, tableId:"", updated:Date.now()};
                    result = mCommon.def.STATUS_SUCCESS;
                    code = mCommon.def.CODE_OK;
                }
            }

            let resArgs = {result:result, code:code};
            let sendPack = mCommon.makePack(mCommon.pk.LoginResponse, resArgs);
            
            client.send(sendPack);

            if(client.isLogin){
                sendPack = mCommon.makePack(mCommon.pk.MasterStateChanged, resArgs);
                this.sendMsgToSlave(sendPack, client.member.mb_uid, true);

                mCommon.log(`${client.member.mb_uid} <== ${sendPack}`);
            }
            else{
                mCommon.log(`${client.session} <== ${sendPack}`);
            } 

        }
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
        if(masterMember){
            resArgs.tableId = masterMember.tableId;
        }

        let sendPack = mCommon.makePack(mCommon.pk.SetMasterResponse, resArgs);
        client.send(sendPack);
    }
    
    async onEnterTableRequest(client, pack){
        let args = pack.args;
        args.tableId = args.tableId.trim();
        
        if(client.isLogin && args.tableId){
            client.member.tableId = args.tableId;
            let resArgs = {tableId:args.tableId};
                
            let sendPack = mCommon.makePack(mCommon.pk.OnEnterRoomReponse, resArgs);

            this.sendMsgToSlave(sendPack, client.member.mb_uid);
    
        }
    }

    async onBettingRequest(client, pack){
        let args = pack.args;
        
        if(client.isLogin && args.tableId && args.side && args.money){
            
            let sendPack = mCommon.makePack(mCommon.pk.OnBettingResponse, args);

            this.sendMsgToSlave(sendPack, client.member.mb_uid);
    
        }
    }

    isExistId(category, uid){
        var clients = this.server.clients;

        for(let client of clients){
            if(client.readyState !== WebSocket.OPEN)
                continue;
                
            if(! client.isLogin)
                continue;
            
            if(client.member.category == category && client.member.mb_uid === uid ){
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