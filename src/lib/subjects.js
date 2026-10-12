export const SEED_SUBJECTS = [
  { id: 'programming', name: 'Programming', icon: 'Code2', color: 'violet', createdBy: 'system', aliases: ['coding','software development','computer programming'] },
  { id: 'mathematics', name: 'Mathematics', icon: 'Calculator', color: 'cyan', createdBy: 'system', aliases: ['math','maths'] },
  { id: 'ece-core', name: 'ECE Core', icon: 'Cpu', color: 'amber', createdBy: 'system', aliases: ['electronics','microprocessors','digital electronics','vlsi'] },
  { id: 'signals-systems', name: 'Signals & Systems', icon: 'Radio', color: 'pink', createdBy: 'system', aliases: ['signals and systems','signal processing'] },
  { id: 'unsorted', name: 'Unsorted', icon: 'BookOpen', color: 'slate', createdBy: 'system', aliases: ['unclassified'] }
];
export const BUILTIN_QUESTS = [
  { id:'builtin-fourier', title:'Fourier Transform', subjectId:'signals-systems', subject:'Signals & Systems', xp:120, difficulty:'Medium', iconName:'Radio', builtIn:true },
  { id:'builtin-python-functions', title:'Python Functions', subjectId:'programming', subject:'Programming', xp:90, difficulty:'Easy', iconName:'Code2', builtIn:true },
  { id:'builtin-8085-interrupts', title:'8085 Interrupts', subjectId:'ece-core', subject:'ECE Core', xp:150, difficulty:'Hard', iconName:'Cpu', builtIn:true },
  { id:'builtin-dip', title:'Digital Image Processing', subjectId:'ece-core', subject:'ECE Core', xp:180, difficulty:'Hard', iconName:'Brain', builtIn:true }
];
export function normalizeSubjectName(value='') { return String(value).normalize('NFKD').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' '); }
export function matchSubject(value, subjects=SEED_SUBJECTS) {
  const normalized=normalizeSubjectName(value); if(!normalized) return null;
  return subjects.find(s => [s.name,...(s.aliases||[])].some(a=>normalizeSubjectName(a)===normalized)) || null;
}
const KEYWORDS = [
  { id:'signals-systems', words:['fourier','laplace','convolution','sampling','signal','signals and systems','z transform'] },
  { id:'ece-core', words:['8085','8051','arm processor','microprocessor','vlsi','digital electronics','electronics','verilog','fpga','circuit'] },
  { id:'mathematics', words:['calculus','linear algebra','probability','statistics','differential equation','mathematics','matrix'] },
  { id:'programming', words:['javascript','python','programming','data structures','dsa','c++',' c ','html','css','sql','git','java','coding','algorithm','software','oop'] }
];
export function keywordClassify(topicName='', goal='', subjects=SEED_SUBJECTS) {
  const text=` ${normalizeSubjectName(topicName)} ${normalizeSubjectName(goal)} `;
  for(const group of KEYWORDS) if(group.words.some(word=>{const normalized=normalizeSubjectName(word);return normalized==='c'?/(^| )c( |$)/.test(text):text.includes(` ${normalized} `)||text.includes(`${normalized} `)||text.includes(` ${normalized}`);})) return subjects.find(s=>s.id===group.id) || null;
  if(/organic chemistry|inorganic chemistry|chemical bond|chemistry|newton|organic compounds/.test(text)) return { id:'__new_chemistry__', name:'Chemistry', icon:'FlaskConical', color:'emerald', createdBy:'ai', aliases:['chemical sciences'] };
  return null;
}
export function migrateSubjectsStore(old={}) {
  const subjects=[...SEED_SUBJECTS.map(s=>({...s,aliases:[...(s.aliases||[])]}))];
  for(const s of (Array.isArray(old.subjects)?old.subjects:[])) if(s?.id && s?.name && !subjects.some(x=>x.id===s.id)) subjects.push({...s,aliases:Array.isArray(s.aliases)?s.aliases:[]});
  const topics=(Array.isArray(old.customTopics)?old.customTopics:[]).map((t,i)=>{
    const oldName=t.subject || t.subjectName || '';
    let match=matchSubject(oldName,subjects) || keywordClassify(t.name||t.title,t.goal,subjects);
    if(match?.id==='__new_chemistry__') { match={...match,id:'chemistry'}; if(!subjects.some(s=>s.id===match.id)) subjects.push(match); }
    return {...t,id:t.id||`migrated-${i}-${normalizeSubjectName(t.name||t.title)}`,name:t.name||t.title||'Untitled topic',subjectId:t.subjectId || match?.id || 'unsorted',subject:match?.name || oldName || 'Unsorted'};
  });
  const battleStats={attempts:[],completedQuests:[],...(old.battleStats||{})};
  battleStats.attempts=(battleStats.attempts||[]).map(a=>{
    const topicName=a.topic||a.topicName||''; const custom=topics.find(t=>normalizeSubjectName(t.name)===normalizeSubjectName(topicName));
    const builtin=BUILTIN_QUESTS.find(q=>normalizeSubjectName(q.title)===normalizeSubjectName(topicName));
    return {...a,topicId:a.topicId||custom?.id||builtin?.id||normalizeSubjectName(topicName),subjectId:a.subjectId||custom?.subjectId||builtin?.subjectId||matchSubject(a.subject,subjects)?.id||keywordClassify(topicName,'',subjects)?.id||'unsorted'};
  });
  battleStats.completedQuests=(battleStats.completedQuests||[]).map(item=>{
    if(item && typeof item==='object') return item;
    const title=String(item); const custom=topics.find(t=>normalizeSubjectName(t.name)===normalizeSubjectName(title)); const builtin=BUILTIN_QUESTS.find(q=>normalizeSubjectName(q.title)===normalizeSubjectName(title));
    return {id:normalizeSubjectName(title),title,subjectId:custom?.subjectId||builtin?.subjectId||'unsorted'};
  });
  return {...old,version:2,subjects,customTopics:topics,battleStats,xp:Number.isFinite(Number(old.xp))?Number(old.xp):0};
}
export function aggregateSubject(subjectId, topics=[], attempts=[], completed=[]) {
  const topicIds=new Set(topics.filter(t=>t.subjectId===subjectId).map(t=>t.id));
  const related=attempts.filter(a=>a.subjectId===subjectId || topicIds.has(a.topicId));
  const correct=related.filter(a=>a.correct).length;
  const topicCount=topics.filter(t=>t.subjectId===subjectId).length;
  const cleared=completed.filter(x=>typeof x==='object'?x.subjectId===subjectId: false).length;
  return {topicCount,attempts:related.length,accuracy:related.length?Math.round(correct/related.length*100):null,cleared};
}
export function moveTopic(topics, topicId, subjectId, subjects) {
  if(!subjects.some(s=>s.id===subjectId)) throw new Error('Choose an existing subject.');
  return topics.map(t=>t.id===topicId?{...t,subjectId,subject:subjects.find(s=>s.id===subjectId).name}:t);
}
export function mergeSubjects(subjects, topics, fromId, toId) {
  if(fromId===toId) throw new Error('Choose a different destination subject.');
  const target=subjects.find(s=>s.id===toId); if(!target) throw new Error('Destination subject not found.');
  return {subjects:subjects.filter(s=>s.id!==fromId),topics:topics.map(t=>t.subjectId===fromId?{...t,subjectId:toId,subject:target.name}:t)};
}
export function deleteSubject(subjects, topics, id) {
  if(topics.some(t=>t.subjectId===id)) throw new Error('Move this subject’s topics before deleting it.');
  if(SEED_SUBJECTS.some(s=>s.id===id)) throw new Error('Built-in subjects cannot be deleted.');
  return subjects.filter(s=>s.id!==id);
}
