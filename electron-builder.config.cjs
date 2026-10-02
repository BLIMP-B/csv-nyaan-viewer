'use strict';
const fs=require('node:fs'),path=require('node:path');
const config=require('./package.json').build;
module.exports={...config,win:{...config.win,...(fs.existsSync(path.join(__dirname,'assets/icon.ico'))?{icon:'assets/icon.ico',signAndEditExecutable:true}:{})}};
