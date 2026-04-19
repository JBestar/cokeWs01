const fs = require('fs');

module.exports = {
    def: {

        
        STATUS_SUCCESS : 'success',
        STATUS_FAIL :    'fail',

        CODE_OK :       1,
        CODE_FAIL :     2,
        CODE_STOP :     3,
        CODE_ERROR :    4,      
        CODE_DUPL :     5,      //Duplicated login
        CODE_INVALID :  6,      //Parameter invalid
        CODE_EXCEED :   7,      //Range Exceed

        CODE_MAINTAIN : 9,
        CODE_OUT :      10,

        
        PERMIT_CANCEL:  0,
        PERMIT_OK:      1,
        PERMIT_WAIT:    2,
        PERMIT_DELETE:  4,

        STATE_DISABLE:  0,
        STATE_ACTIVE:   1,
        STATE_VERIFY:   2,
        STATE_REFUSE:   3,
        STATE_WAIT:     4,
        STATE_HOT:      5,

        LOG_LEVEL : 0, //0-all 1-error, 2-no
        LOG_DB: "db",

        SAVE_PACK : false,
    },    
    pk: {
        loginRequest : 'loginRequest',
        loginResponse : 'loginResponse',

        setMasterRequest : 'setMasterRequest',
        setMasterResponse : 'setMasterResponse',
        resetMasterRequest : 'resetMasterRequest',
        resetMasterResponse : 'resetMasterResponse',
        masterStateChanged : 'masterStateChanged',
        
        onEnterTableRequest : 'onEnterTableRequest',
        onEnterTableResponse : 'onEnterTableResponse',

        onMessageRequest : 'onMessageRequest',
        onMessageResponse : 'onMessageResponse',

        onMessageAck : 'onMessageAck',

        metricsPing : 'metrics.ping',
        metricsPong : 'metrics.pong',
    },
    log: function (txt, force=false, err=false) {
        if(!force){
            if(mCommon.def.LOG_LEVEL == 2) // 
                return;
            if(mCommon.def.LOG_LEVEL == 1 && !err) // 
                return;
        }
            
        let fileName = toDate(new Date());
        // if(name.length > 0) 
        //     fileName += "_" + name;
        const filePath = "log/"+fileName+".log";
        const content = "[" + toTime(new Date()) + "] " + txt + "\n";
        try{
            fs.appendFile(filePath, content, function (err) {
                // if (err) throw err;
                if (err)
                    console.log(toTime(new Date()) + " log error!");
            });
        } catch(err){
            console.log(toTime(new Date()) + " log error!!");
        }
    },
    makePack: function (type, args, time = null) {
        var objPack = {type:type, args:args};
        objPack.id = randStr(12);
        if(time)
            objPack.time = time;
        return objPack;
    },
    randString(length){
        return randStr(length);
    },
    fetchStr: function (txt, strStart, strEnd = '', from = 0, obj = null){
        if(obj)
            obj.last = -1;
        if(txt.length < 1 || strStart.length < 1 )
            return "";
        let posStart = txt.indexOf(strStart);
        if(posStart < 0)
            return "";
        let posFind = posStart;
        if(from == 1){
            posFind += strStart.length ;
            posStart = posFind;
        } 
        else if(from > 1){
            posFind = posStart < from ? from : posStart;
        } 

        let posEnd = -1;
        if(strEnd.length > 0)
            posEnd = txt.indexOf(strEnd, posFind);
        if(posEnd < 0)
            return txt.substr(posStart);
        if(obj)
            obj.last = posEnd;
        return txt.substring(posStart, posEnd); //txt.slice(posStart, posEnd);
    }, 
    dateStr(dt){
        return toDate(dt);
    },
    dateTimeStr(dt){
        return toDate(dt) + " " + toTime(dt);
    },
    tmStamp(dt){
        return Math.floor(dt / 1000);
    },
    getTextLength(str) {
        var len = 0;
        for (var i = 0; i < str.length; i++) {
            if (escape(str.charAt(i)).length == 6) {
                len++;
            }
            len++;
        }
        return len;
    },
    
};

function toDate(dt){
    
    let year = dt.getFullYear();
    let month = ("0" + (dt.getMonth() + 1)).slice(-2);
    let day = ("0" + dt.getDate()).slice(-2);
    return year + "-" + month + "-" + day;
} 
  
function toTime(dt){
    
    let hour = ("0" + dt.getHours()).slice(-2);
    let minute = ("0" + dt.getMinutes()).slice(-2);
    let seconds = ("0" + dt.getSeconds()).slice(-2);
    let milliseconds = ("00" + dt.getMilliseconds()).slice(-3);
    return hour + ":" + minute + ":" + seconds + "." + milliseconds;
} 

function randStr(length) {
    const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
    const randomArray = Array.from(
      { length: length },
      (v, k) => chars[Math.floor(Math.random() * chars.length)]
    );
  
    return randomArray.join("");
}
