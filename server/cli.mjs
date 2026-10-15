import path from 'node:path';
import {createDatabase} from './database.mjs';
import {bootstrap} from './auth.mjs';
const command=process.argv[2];
if (command !== 'init') {
  console.error('Usage: npm run backend:init (with JOBSTER_ADMIN_EMAIL, JOBSTER_ADMIN_PASSWORD, optional JOBSTER_COMPANY, JOBSTER_ADMIN_NAME)');
  process.exit(2);
}
const filename=path.resolve(process.env.JOBSTER_DB||'var/jobster.sqlite');
if (!process.env.JOBSTER_ADMIN_EMAIL || !process.env.JOBSTER_ADMIN_PASSWORD) {
  console.error('Set JOBSTER_ADMIN_EMAIL and JOBSTER_ADMIN_PASSWORD; do not commit credentials.');
  process.exit(2);
}
const db=createDatabase(filename);
try {
  await bootstrap(db,{
    email:process.env.JOBSTER_ADMIN_EMAIL,password:process.env.JOBSTER_ADMIN_PASSWORD,
    name:process.env.JOBSTER_ADMIN_NAME||'',company:process.env.JOBSTER_COMPANY||'Falcon Jobster'
  });
  console.log('Workspace created:',filename,'\nSign in at / with the configured admin email. Default jobs seeded (Программист, Водитель, Диспетчер, Строитель); no sample candidates.');
} catch(error) { console.error('Initialization failed:',error.message);process.exitCode=1; }
finally {db.close();}
