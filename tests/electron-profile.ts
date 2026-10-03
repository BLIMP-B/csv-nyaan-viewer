import {_electron as electron} from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
// Existing feature tests exercise returning users; tutorial.spec.ts uses the
// real first-launch path with an untouched profile and no production test flag.
export async function launchWithoutTutorial(options:Parameters<typeof electron.launch>[0]){
  const argument=options?.args?.find(a=>a.startsWith('--user-data-dir='));if(!argument)throw Error('An isolated test profile is required');
  const directory=argument.slice('--user-data-dir='.length),file=path.join(directory,'preferences.json');fs.mkdirSync(directory,{recursive:true});
  let prefs:Record<string,unknown>={};if(fs.existsSync(file))prefs=JSON.parse(fs.readFileSync(file,'utf8'));if(!prefs.tutorialStatus){prefs.tutorialStatus='skipped';fs.writeFileSync(file,JSON.stringify(prefs));}
  return electron.launch(options);
}
