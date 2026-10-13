import fs from 'node:fs';
export default async function handler(req,res) {
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'Koristi gumb za generiranje.'});
  if(process.env.ACCESS_PIN && req.headers['x-access-pin']!==process.env.ACCESS_PIN)return res.status(403).json({error:'Pogrešan PIN.'});
  const key=process.env.OPENAI_API_KEY;
  if(!key)return res.status(500).json({error:'U Vercel postavkama nedostaje OPENAI_API_KEY. Dodaj ga i napravi Redeploy.'});
  let b;
  try{b=typeof req.body==='string'?JSON.parse(req.body):req.body;}catch{return res.status(400).json({error:'Neispravan zahtjev.'});}
  const count=Number(b?.broj);
  if(!Number.isInteger(count)||count<1||count>10)return res.status(400).json({error:'Odaberi od 1 do 10 zadataka.'});
  if(!['Lako','Srednje','Genijalac'].includes(b?.tezina))return res.status(400).json({error:'Neispravna težina.'});
  const topics=JSON.parse(fs.readFileSync(new URL('../data/topics.json',import.meta.url),'utf8'));
  const topic=topics.find(t=>t.razred===String(b.razred)&&t.tema===b.tema);
  if(!topic)return res.status(400).json({error:'Tema ne postoji.'});
  const system='Ti si stručnjak za instrukcije matematike za osnovnu školu. Generiraj jasne zadatke primjenjive u stvarnom životu, primjerene uzrastu. Piši hrvatski. Ne koristi HTML, Markdown, LaTeX ni znak dolara. Izraze piši običnim tekstom: ×, ÷, 10³ ili 3/4. Vrati JSON objekt s poljem zadaci koje je niz objekata sa strukturom {naslov,zadatak,opcije,tocan_indeks,objasnjenje}. Svaki zadatak ima četiri različita ponuđena odgovora, točno jedan točan, indeks od 0 do 3. U objašnjenju navedi postupak i tipične greške. Provjeri račun i jednoznačnost pitanja.';
  const prompt=`${system}\nGeneriraj ${count} zadataka za ${topic.razred}. razred.\nTema: ${topic.tema}\nUputa: ${topic.prompt}\nPrimjene: ${topic.primjena}\nTežina: ${b.tezina}`;
  try {
    const model=process.env.OPENAI_MODEL?.trim()||'gpt-4.1-mini';
    const taskSchema={type:'object',additionalProperties:false,required:['naslov','zadatak','opcije','tocan_indeks','objasnjenje'],properties:{naslov:{type:'string'},zadatak:{type:'string'},opcije:{type:'array',items:{type:'string'}},tocan_indeks:{type:'integer',enum:[0,1,2,3]},objasnjenje:{type:'string'}}};
    const schema={type:'object',additionalProperties:false,required:['zadaci'],properties:{zadaci:{type:'array',items:taskSchema}}};
    const response=await fetch('https://api.openai.com/v1/responses',{
      method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${key}`},
      body:JSON.stringify({model,input:prompt,store:false,max_output_tokens:8000,text:{format:{type:'json_schema',name:'matematicki_zadaci',strict:true,schema}}}),
      signal:AbortSignal.timeout(50000)
    });
    if (!response.ok) {
      const details = await response.json().catch(() => ({}));
      const message = String(details.error?.message || 'Nema detalja.')
        .split(key).join('[skriven ključ]');

      return res.status(502).json({
        error: `OpenAI ${response.status}; model=${JSON.stringify(model)}; ${message}`
      });
    }
    const data=await response.json();
    if(data.status!=='completed')return res.status(502).json({error:'OpenAI nije dovršio odgovor. Pokušaj s manje zadataka.'});
    const content=(data.output||[]).filter(i=>i.type==='message').flatMap(i=>i.content||[]);
    if(content.some(i=>i.type==='refusal'))return res.status(502).json({error:'Model je odbio generiranje. Pokušaj s drugom temom.'});
    const text=content.filter(i=>i.type==='output_text').map(i=>i.text).join('');
    const tasks=JSON.parse(text).zadaci;
    if(!Array.isArray(tasks)||tasks.length!==count)throw new Error('format');
    for(const t of tasks){if(!['naslov','zadatak','objasnjenje'].every(k=>typeof t?.[k]==='string')||!Array.isArray(t.opcije)||t.opcije.length!==4||!t.opcije.every(o=>typeof o==='string')||new Set(t.opcije).size!==4||!Number.isInteger(t.tocan_indeks)||t.tocan_indeks<0||t.tocan_indeks>3)throw new Error('format');}
    const escape=s=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    // Pôvodné sučelje koristi innerHTML za ova polja.
    for(const t of tasks)for(const k of ['naslov','zadatak','objasnjenje'])t[k]=escape(t[k]);
    return res.status(200).json(tasks);
  }catch(e){return res.status(502).json({error:e.name==='TimeoutError'?'OpenAI nije odgovorio na vrijeme. Pokušaj s jednim zadatkom.':'OpenAI nije vratio očekivani format zadataka. Pokušaj ponovno.'});}
}
