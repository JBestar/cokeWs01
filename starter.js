const fs = require('fs')
const http = require('http')
const url = require('url')
const ini = require('ini')
const LoServer = require('./server/loserver')

class Starter {

    constructor(){
        this.create();
    }

    async create(){

        var httpServer = http.createServer();

        var dir = './log';
        if (!fs.existsSync(dir)){
            fs.mkdirSync(dir, { recursive: true });
        }
        var dir = './log/bak';
        if (!fs.existsSync(dir)){
            fs.mkdirSync(dir, { recursive: true });
        }

        global.gLoServer = new LoServer();

        await this.deleteLog();
        
        httpServer.on('upgrade', function upgrade(request, socket, head) {
            const path = url.parse(request.url, true);
            // console.log(path.pathname);
            try {
                if (path.pathname === '/ws') {
                    gLoServer.server.handleUpgrade(request, socket, head, function done(ws) {
                        gLoServer.server.emit('connection', ws, request);
                    });
                } else {
                    socket.destroy();
                }
            } catch(e) {
                mCommon.log(`<WsServer> connection error: ${e}`, true);   
            }

        });
        
        httpServer.listen(mEnv.def.WS_SERVER_PORT);

        this.check();
    }


    async check() {
        this.readConfig();

        this.tkLong = setInterval(() => {

            this.readConfig();
            // this.deleteLog();
        }, 60000);

    }

    async readConfig(){
        try{

            let text = fs.readFileSync(`./config.ini`, 'utf-8');

            const config = ini.parse(text);
            if(config.info){
                if(config.info.log_level !== undefined){
                    let logLv = parseInt(config.info.log_level);
                    if(logLv != mCommon.def.LOG_LEVEL){
                        mCommon.def.LOG_LEVEL = logLv;
                        mCommon.log(`<readConfig> LOG_LEVEL = ${mCommon.def.LOG_LEVEL} `, true);
                    }
                }
            }
        } catch (err) {
            mCommon.log(`<readConfig> err : ` + err, true);
        }
    }

    async deleteLog(){

        var dir = './log';
        var dirBak = dir+'/bak';
        let date = mCommon.dateStr(new Date());
        try{
            const files = fs.readdirSync(dir);
            //listing all files using forEach
            for(let file of files){
                let stats = await fs.statSync(`${dir}/${file}`);
                if(stats.isFile() && !file.startsWith(date) ){
                    await fs.renameSync( `${dir}/${file}`, `${dirBak}/${file}` );
                }
            }
        } catch (err) {
            console.log(`Unable to scan directory : ` + err);
        }
    }

};

module.exports = new Starter();