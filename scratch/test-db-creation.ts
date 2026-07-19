import postgres from 'postgres';

async function ensureLocalDatabaseExists(connectionString: string) {
    if (!connectionString.includes('localhost') && !connectionString.includes('127.0.0.1')) {
        return; // Only automate for local database
    }
    
    try {
        const url = new URL(connectionString);
        const dbName = url.pathname.substring(1); // remove leading slash
        if (!dbName || dbName === 'postgres') {
            return;
        }
        
        url.pathname = '/postgres';
        const tempSql = postgres(url.toString(), { ssl: false });
        
        const dbExists = await tempSql`
            SELECT 1 FROM pg_database WHERE datname = ${dbName}
        `;
        
        if (dbExists.length === 0) {
            console.log(`📡 Local database "${dbName}" not found. Creating it...`);
            await tempSql.unsafe(`CREATE DATABASE "${dbName}"`);
            console.log(`✅ Local database "${dbName}" created successfully!`);
        } else {
            console.log(`✅ Local database "${dbName}" already exists.`);
        }
        await tempSql.end();
    } catch (e: any) {
        console.warn(`⚠️ Warning while checking/creating local database: ${e.message}`);
    }
}

ensureLocalDatabaseExists('postgres://postgres:@localhost:5432/jtxfield')
    .then(() => process.exit(0))
    .catch((e) => {
        console.error(e);
        process.exit(1);
    });
