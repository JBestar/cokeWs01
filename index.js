
global.mEnv = require('./env')
global.mCommon = require('./helpers/common')

// global.gDbConn = null;
global.gDbAsynPool = null;

global.mConfig = require('./helpers/config')
mConfig.connectDb();

console.log(mCommon.dateTimeStr(new Date()));


global.gModel = new Object();
global.gModel.category = require('./model/category');
// global.gModel.member = require('./model/member');
global.gModel.sess = require('./model/sess');

setTimeout(function() {
    global.mStarter = require('./starter');
}, 1000);


