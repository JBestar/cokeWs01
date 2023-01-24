class Sess{
    
    table = 'tbl0_category';
    fields = ['cat_id', 'cat_name', 'cat_title'];

    async getByName(name){
        
        let conn = await gDbAsynPool.getConnection(async conn => conn);

        let tbColum = this.fields.join(', ');

        let sql = ` SELECT ${tbColum} FROM ${this.table} WHERE cat_name = '${name}' `;
        
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