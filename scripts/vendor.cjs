'use strict';
const fs=require('node:fs');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const files=[
 ['marked/lib/marked.umd.js','marked.umd.js'],
 ['marked/LICENSE','marked-LICENSE.txt'],
 ['dompurify/dist/purify.min.js','purify.min.js'],
 ['dompurify/LICENSE','dompurify-LICENSE.txt']
];
fs.mkdirSync(path.join(root,'vendor'),{recursive:true});
for(const [source,name]of files){
 fs.copyFileSync(path.join(root,'node_modules',source),path.join(root,'vendor',name));
}
fs.writeFileSync(path.join(root,'vendor/README.md'),
 '# Vendored Markdown libraries\n\n'+
 'marked 18.1.2 (MIT), DOMPurify 3.4.17 (MPL-2.0 OR Apache-2.0).\n'+
 'Copied from the exact npm versions in package-lock.json by `npm run vendor`.\n'+
 'Bundled locally for offline desktop use; no CDN is used.\n');
console.log('Markdown libraries and their licences copied to vendor/.');
