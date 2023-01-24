class Member{
    
    fields = ['mb_fid', 'mb_emp_fid', 'mb_uid', 'mb_state_active', 'mb_state_delete'];

    getTableName(game){
        return "tbl_"+game+"_member"
    }

    async getByFid(game, fid){
        
        let conn = await gDbAsynPool.getConnection(async conn => conn);

        let table = this.getTableName(game);
        let tbColum = this.fields.join(', ');

        let sql = ` SELECT ${tbColum} FROM ${table} WHERE mb_fid = ${fid} `;
        
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

    async getByUid(game, uid){
        let conn = await gDbAsynPool.getConnection(async conn => conn);

        let table = this.getTableName(game);
        let tbColum = this.fields.join(', ');
        let sql = ` SELECT ${tbColum} FROM ${table} WHERE mb_uid = '${uid}' `;
        
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

module.exports = new Member();