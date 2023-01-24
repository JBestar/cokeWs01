class Sess{
    
    fields = ['sess_id', 'sess_emp_fid', 'sess_mb_uid'];

    getTableName(game){
        return "tbl_"+game+"_session"
    }

    async getById(game, session){
        
        let conn = await gDbAsynPool.getConnection(async conn => conn);

        let table = this.getTableName(game);
        let tbColum = this.fields.join(', ');

        let sql = ` SELECT ${tbColum} FROM ${table} WHERE sess_id = '${session}' `;
        
        try{
            let [data, ] = await conn.execute(sql);
            await conn.unprepare(sql);
            await conn.release();
            if(data && data[0])
                return data[0];
            else null;
        } catch(err){
            await conn.release();
            return null;
        }
    }



}

module.exports = new Sess();