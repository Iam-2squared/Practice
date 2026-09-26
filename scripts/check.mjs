import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
let count=0;
for (const dir of ['api','lib','public','scripts','tests']) {
 for (const file of await readdir(dir)) {
  if (!/\.(mjs|js)$/.test(file)) continue;
  const result=spawnSync(process.execPath,['--check',`${dir}/${file}`],{stdio:'inherit'});
  if(result.status) process.exit(result.status); count++;
 }
}
console.log(`Syntax check passed: ${count} JavaScript files.`);
