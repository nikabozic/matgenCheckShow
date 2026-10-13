import fs from 'node:fs';
function csv(text) {
  const rows=[]; let row=[], field='', quoted=false;
  text=text.replace(/^\uFEFF/,'');
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(c==='"') { if(quoted && text[i+1]==='"'){field+='"';i++;}else quoted=!quoted; }
    else if(c===','&&!quoted){row.push(field);field='';}
    else if((c==='\n'||c==='\r')&&!quoted){if(c==='\r'&&text[i+1]==='\n')i++;row.push(field);rows.push(row);row=[];field='';}
    else field+=c;
  }
  if(field||row.length){row.push(field);rows.push(row);}return rows;
}
const topics=csv(fs.readFileSync('data/zadaci.csv','utf8')).slice(1).filter(r=>/^[1-8]$/.test(r[0]?.trim())&&r.length>=4).map(r=>({razred:r[0].trim(),tema:r[1].trim(),prompt:r[2].trim(),primjena:r[3].trim()}));
fs.mkdirSync('public',{recursive:true});
const grades=[...new Set(topics.map(t=>t.razred))].sort();
let html=fs.readFileSync('data/template.html','utf8').replace('GRADE_OPTIONS',grades.map(r=>`<option value="${r}">${r}. Razred</option>`).join('')).replace('TOPIC_DATA',JSON.stringify(topics).replaceAll('<','\\u003c'));
fs.writeFileSync('public/index.html',html);
fs.writeFileSync('data/topics.json',JSON.stringify(topics));
for(const file of ['PALE-logo-black.svg','favicon.png'])fs.copyFileSync('data/'+file,'public/'+file);
console.log(`Izgrađena stranica: ${topics.length} tema.`);
