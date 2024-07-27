const mysql2 = require('mysql2');
const { Connection } = require('oraios-queries')

module.exports = {
    
    async connectDb(){

        let connected = false;
        if(gDbAsynPool){
            try{
                let conn = await gDbAsynPool.getConnection(async conn => conn);
                let sql = "select @@Global.innodb_buffer_pool_size";
                let [data, ] = await conn.execute(sql);
                await conn.release();
                connected = true;
            } catch(e){
                console.log(e);
            }
        }

        if(!connected){

            const dbPool = mysql2.createPool({
                host: mEnv.db.HOST,
                user: mEnv.db.USER,
                password: mEnv.db.PASSWORD,
                database: mEnv.db.NAME,
                waitForConnections: true,
                connectionLimit: 300,
                queueLimit: 0
            });

            // gDbConn = new Connection({
            //     connection: dbPool,
            //     type: 'mysql'
            // });

            gDbAsynPool = dbPool.promise();
            mCommon.log(`<connect> Db`);   
        }
        // await gDbAsynConn.execute('SET TRANSACTION ISOLATION LEVEL READ COMMITTED'); //sql default;
    },
};
