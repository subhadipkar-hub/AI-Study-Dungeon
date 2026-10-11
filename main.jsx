import React, { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { createRoot } from "react-dom/client";
import {
  BookOpen, Brain, FlaskConical, ChevronRight, Flame, Gamepad2, LayoutDashboard,
  MessageSquare, Moon, Search, Send, Settings, Shield, Sparkles,
  Swords, Trophy, UserRound, Zap, Target, CheckCircle2, Menu, X,
  Code2, Calculator, Cpu, Radio, CalendarDays, TrendingUp, Clock3, Star, Plus, BrainCircuit, ClipboardCheck, GraduationCap, BarChart3, Heart, RefreshCw
} from "lucide-react";
import { evaluateStageGate } from "./lib/learning.js";
import { SEED_SUBJECTS, BUILTIN_QUESTS, normalizeSubjectName, matchSubject, keywordClassify, migrateSubjectsStore, aggregateSubject, moveTopic, mergeSubjects, deleteSubject } from "./lib/subjects.js";
import "./styles.css";

const quests = BUILTIN_QUESTS.map(q => ({ ...q, subject: q.subject, icon: ({Code2,Calculator,Cpu,Radio,Brain})[q.iconName] || BookOpen, progress: 0 }));
const subjectIconMap = { Code2, Calculator, Cpu, Radio, BookOpen, Brain, FlaskConical, GraduationCap };
function readAppStore() {
  const empty = { version: 2, xp: 0, battleStats: { attempts: [], completedQuests: [] }, customTopics: [], subjects: SEED_SUBJECTS };
  try {
    const current = JSON.parse(localStorage.getItem("sd:v2") || "null");
    if (current && current.version === 2) return migrateSubjectsStore({ ...empty, ...current, battleStats: { ...empty.battleStats, ...(current.battleStats || {}) } });
    const legacyStats = JSON.parse(localStorage.getItem("study-dungeon-stats") || "null");
    const legacyTopics = JSON.parse(localStorage.getItem("study-dungeon-custom-topics") || "[]");
    const legacyXp = Number(localStorage.getItem("study-dungeon-xp") || 0);
    return migrateSubjectsStore({ ...empty, xp: Number.isFinite(legacyXp) ? legacyXp : 0, battleStats: legacyStats || empty.battleStats, customTopics: Array.isArray(legacyTopics) ? legacyTopics : [] });
  } catch { return migrateSubjectsStore(empty); }
}

async function classifyOne(topic, subjects, userSubject = "") {
  const typedMatch = matchSubject(userSubject, subjects);
  if (typedMatch) return { subject: typedMatch, subjects, confidence: 1, reason: "Matched an existing subject name or alias." };
  try {
    const response = await fetch("/api/topic/classify", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ topicName:topic.name||topic.title, goal:topic.goal||"", userSubject, existingSubjects:subjects.map(({id,name,aliases})=>({id,name,aliases})) }) });
    if (response.ok) {
      const data = await response.json();
      if (typeof data.confidence === "number" && data.confidence >= 0 && data.confidence <= 1 && typeof data.reason === "string") {
        if (data.subjectId && subjects.some(s=>s.id===data.subjectId) && data.confidence >= 0.7) return {subject:subjects.find(s=>s.id===data.subjectId),subjects,confidence:data.confidence,reason:data.reason};
        if (data.newSubject && typeof data.newSubject.name === "string" && data.newSubject.name.trim()) {
          const same = matchSubject(data.newSubject.name, subjects);
          if (same) return {subject:same,subjects,confidence:data.confidence,reason:data.reason};
          const id = normalizeSubjectName(data.newSubject.name).replace(/ /g,"-") || `subject-${Date.now()}`;
          const created = {id,name:data.newSubject.name.trim(),icon:data.newSubject.icon||"BookOpen",color:data.newSubject.color||"violet",createdBy:"ai",aliases:[]};
          return {subject:created,subjects:[...subjects,created],confidence:data.confidence,reason:data.reason};
        }
      }
    }
  } catch (error) { /* Classification failures are handled by the local fallback below. */ }
  const fallback = keywordClassify(topic.name||topic.title, topic.goal, subjects);
  if (fallback) {
    if (fallback.id.startsWith("__new_") || !subjects.some(s=>s.id===fallback.id)) {
      const id=normalizeSubjectName(fallback.name).replace(/ /g,"-");
      const created={...fallback,id,createdBy:fallback.createdBy||"ai",aliases:fallback.aliases||[]};
      return {subject:created,subjects:subjects.some(s=>s.id===id)?subjects:[...subjects,created],confidence:0.75,reason:"Placed using local keyword rules."};
    }
    return {subject:fallback,subjects,confidence:0.75,reason:"Placed using local keyword rules."};
  }
  return {subject:subjects.find(s=>s.id==="unsorted")||subjects[0],subjects,confidence:0,reason:"Could not confidently classify; saved to Unsorted."};
}
async function classifyTopics(topics, initialSubjects) {
  let subjects=[...initialSubjects]; const mapping={};
  try {
    const response=await fetch("/api/topic/classify-batch",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({topics:topics.map(t=>({id:t.id,topicName:t.name||t.title,goal:t.goal||""})),existingSubjects:subjects.map(({id,name,aliases})=>({id,name,aliases}))})});
    if(response.ok){const data=await response.json();if(Array.isArray(data.results)){for(const topic of topics){const r=data.results.find(x=>x.id===topic.id);if(!r)continue;if(r.subjectId&&subjects.some(s=>s.id===r.subjectId)&&r.confidence>=0.7){mapping[topic.id]=r.subjectId;continue;}if(r.newSubject?.name){const same=matchSubject(r.newSubject.name,subjects);if(same){mapping[topic.id]=same.id;continue;}const created={id:normalizeSubjectName(r.newSubject.name).replace(/ /g,"-"),name:r.newSubject.name,icon:r.newSubject.icon||"BookOpen",color:r.newSubject.color||"violet",createdBy:"ai",aliases:[]};subjects.push(created);mapping[topic.id]=created.id;}}}}
  } catch { /* Batch API failure falls back locally. */ }
  for(const topic of topics){if(mapping[topic.id])continue;const result=await classifyOne(topic,subjects,"");subjects=result.subjects;mapping[topic.id]=result.subject?.id||"unsorted";}
  return {subjects,mapping};
}

function App() {
  const initialRoute = window.location.hash.match(/^#\/dungeons\/([^/]+)$/);
  const [page, setPage] = useState(initialRoute ? "subject" : "dashboard");
  const [selectedSubjectId, setSelectedSubjectId] = useState(initialRoute ? decodeURIComponent(initialRoute[1]) : "programming");
  const [subjectsList, setSubjectsList] = useState(() => readAppStore().subjects || SEED_SUBJECTS);
  const [selectedQuest, setSelectedQuest] = useState(quests[0]);
  const [battleStats, setBattleStats] = useState(() => readAppStore().battleStats);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [input, setInput] = useState("");
  const [xp, setXp] = useState(() => readAppStore().xp);
  const [isThinking, setIsThinking] = useState(false);
  const [chat, setChat] = useState([
    { role: "assistant", text: "Welcome back, Dungeon Scholar. What are we learning today? I’ll adapt to your answers and ask you to explain your reasoning so we can identify what you understand and what needs more practice." }
  ]);
  const [customTopics, setCustomTopics] = useState(() => readAppStore().customTopics);

  const level = Math.floor(xp / 500) + 1;

  useEffect(() => {
    try {
      localStorage.setItem("sd:v2", JSON.stringify({ version: 2, xp, battleStats, customTopics, subjects: subjectsList, updatedAt: new Date().toISOString() }));
    } catch (error) {
      console.warn("Study Dungeon could not save progress locally", error);
    }
  }, [xp, battleStats, customTopics, subjectsList]);

  useEffect(() => {
    const onPop = () => { const hash=window.location.hash; const m=hash.match(/^#\/dungeons\/([^/]+)$/); if(m){setPage("subject");setSelectedSubjectId(decodeURIComponent(m[1]));} else {const route=hash.replace(/^#\/?/,"").split("/")[0];setPage(["dashboard","tutor","quests","subjects","progress","topics","achievements","settings","journey"].includes(route)?route:"dashboard");} };
    window.addEventListener("popstate",onPop); return () => window.removeEventListener("popstate",onPop);
  }, []);
  function openSubject(id) { setSelectedSubjectId(id); setPage("subject"); window.history.pushState({page:"subject",subjectId:id},"",`#/dungeons/${encodeURIComponent(id)}`); }
  function goPage(next) { setPage(next); if(next !== "subject") window.history.pushState({page:next},"",`#/${next}`); }

  const nav = [
    ["dashboard", "Dashboard", LayoutDashboard],
    ["tutor", "AI Tutor", MessageSquare],
    ["quests", "Quests", Swords],
    ["subjects", "Dungeons", BookOpen],
    ["progress", "Progress", BarChart3],
    ["topics", "My Topics", BrainCircuit],
    ["achievements", "Achievements", Trophy]
  ];

  function startQuest(q, mode) {
    setSelectedQuest({ ...q, initialMode: mode || q.initialMode || "basics" });
    setPage("journey");
  }

  function saveTopicUpdate(updatedTopic) {
    setCustomTopics(current => {
      const updated = current.map(t => t.id === updatedTopic.id ? updatedTopic : t);
      return updated;
    });
    setSelectedQuest(updatedTopic);
  }

  function recordAttempt(attempt) {
    setBattleStats(current => {
      const topic = customTopics.find(t => t.id === attempt.topicId || normalizeSubjectName(t.name) === normalizeSubjectName(attempt.topic));
      const builtin = quests.find(q => normalizeSubjectName(q.title) === normalizeSubjectName(attempt.topic));
      const subjectId = attempt.subjectId || topic?.subjectId || builtin?.subjectId || "unsorted";
      const updated = { ...current, attempts: [...(current.attempts || []), { ...attempt, topicId: attempt.topicId || topic?.id || builtin?.id || normalizeSubjectName(attempt.topic), subjectId }] };
      return updated;
    });
    if (attempt.correct) setXp(current => {
      const updated = current + attempt.xp;
      return updated;
    });
  }

  function completeQuest(title) {
    setBattleStats(current => {
      const subjectId = customTopics.find(t => t.id === title || t.name === title)?.subjectId || quests.find(q=>q.title===title)?.subjectId || "unsorted";
      const existing = current.completedQuests || [];
      const item = { id: normalizeSubjectName(title), title, subjectId };
      const updated = { ...current, completedQuests: [...existing.filter(x => (typeof x === "string" ? x : x.title) !== title), item] };
      return updated;
    });
  }

  async function sendMessage(value = input) {
    const userText = value.trim();
    if (!userText || isThinking) return;

    const nextChat = [...chat, { role: "user", text: userText }];

    setChat(nextChat);
    setInput("");
    setIsThinking(true);

    // Add an empty assistant message so streamed text appears live.
    setChat(current => [...current, { role: "assistant", text: "" }]);

    const controller = new AbortController();
    let timeoutId = setTimeout(() => controller.abort(), 50000);
    try {
      const response = await fetch("/api/chat/stream", {
        method: "POST",
        signal: controller.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextChat.map(message => ({
            role: message.role,
            text: message.text
          }))
        })
      });

      if (!response.ok || !response.body) {
        let errorMessage = "The AI service could not respond.";
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {}
        throw new Error(errorMessage);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value: chunk, done } = await reader.read();
        if (done) break;
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => controller.abort(), 50000);

        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.trim()) continue;

          let packet;
          try { packet = JSON.parse(line); }
          catch { throw new Error("The tutor returned an incomplete response. Please retry."); }

          if (packet.type === "text") {
            setChat(current => {
              const updated = [...current];
              const last = updated.length - 1;
              updated[last] = {
                ...updated[last],
                text: updated[last].text + packet.text
              };
              return updated;
            });
          }

          if (packet.type === "error") {
            throw new Error(packet.error);
          }
        }
      }

      // Tutor messages do not award XP; XP is earned from recorded learning attempts.
    } catch (error) {
      const reason = error?.name === "AbortError"
        ? "The tutor took too long to respond. Please try again; the request was stopped after 50 seconds."
        : `I couldn't reach the AI service. ${error.message}`;
      setChat(current => {
        const updated = [...current];
        const last = updated.length - 1;
        updated[last] = { role: "assistant", text: reason };
        return updated;
      });
    } finally {
      clearTimeout(timeoutId);
      setIsThinking(false);
    }
  }

  function exportProgress() {
    const payload = { version: 2, xp, battleStats, customTopics, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
    anchor.href = url; anchor.download = "ai-study-dungeon-progress.json"; anchor.click(); URL.revokeObjectURL(url);
  }

  async function importProgress(file) {
    const data = JSON.parse(await file.text());
    if (!data || !Array.isArray(data.customTopics) || !data.battleStats || !Array.isArray(data.battleStats.attempts) || !Number.isFinite(Number(data.xp))) throw new Error("That file is not a valid Study Dungeon progress export.");
    setXp(Math.max(0, Number(data.xp))); setBattleStats({ attempts: data.battleStats.attempts, completedQuests: Array.isArray(data.battleStats.completedQuests) ? data.battleStats.completedQuests : [] }); setCustomTopics(data.customTopics);
  }

  function navigate(id) {
    goPage(id);
    setMobileOpen(false);
  }

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileOpen ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-mark"><Swords size={20} /></div>
          <div>
            <strong>STUDY DUNGEON</strong>
            <span>AI LEARNING REALM</span>
          </div>
          <button className="icon-btn mobile-close" aria-label="Close navigation" onClick={() => setMobileOpen(false)}>
            <X size={19} />
          </button>
        </div>

        <div className="player-card">
          <div className="avatar"><UserRound size={22} /></div>
          <div className="player-copy">
            <b>Dungeon Scholar</b>
            <span>Level {level} · Explorer</span>
          </div>
          <div className="level-ring">{level}</div>
        </div>

        <nav>
          <div className="nav-label">REALM</div>
          {nav.map(([id, label, Icon]) => (
            <button
              key={id}
              className={`nav-item ${page === id ? "active" : ""}`}
              onClick={() => navigate(id)}
            >
              <Icon size={18} />
              <span>{label}</span>
              {id === "tutor" && <span className="nav-dot" />}
            </button>
          ))}

          <div className="nav-label">ACCOUNT</div>
          <button className={`nav-item ${page === "settings" ? "active" : ""}`} onClick={() => navigate("settings")}>
            <Settings size={18} />
            <span>Settings</span>
          </button>
        </nav>

        <div className="sidebar-bottom">
          <div className="streak">
            <Flame size={18} />
            <div>
              <b>Study streak</b>
              <span>Activity tracking coming next</span>
            </div>
          </div>
          
        </div>
      </aside>

      {mobileOpen && <div className="backdrop" onClick={() => setMobileOpen(false)} />}

      <main className="main">
        <header className="topbar">
          <button className="icon-btn menu-btn" aria-label="Open navigation" onClick={() => setMobileOpen(true)}>
            <Menu size={21} />
          </button>
          <div className="crumb">
            <span>Study Dungeon</span>
            <ChevronRight size={15} />
            <b>{nav.find(item => item[0] === page)?.[1] || (page === "subject" ? "Dungeons" : page)}</b>
          </div>
          <div className="top-actions">
            <div className="xp-chip"><Zap size={15} /> {xp.toLocaleString()} XP</div>

          </div>
        </header>

        {page === "dashboard" && <Dashboard setPage={goPage} startQuest={startQuest} xp={xp} battleStats={battleStats} customTopics={customTopics} subjectsList={subjectsList} openSubject={openSubject} />}
        {page === "tutor" && (
          <Tutor
            chat={chat}
            input={input}
            setInput={setInput}
            sendMessage={sendMessage}
            isThinking={isThinking}
          />
        )}
        {page === "quests" && <Quests setPage={goPage} startQuest={(q) => startQuest(q)} customTopics={customTopics} subjectsList={subjectsList} battleStats={battleStats} />}
        {page === "journey" && <Journey topic={selectedQuest} onSave={saveTopicUpdate} onAttempt={(attempt) => recordAttempt({ ...attempt, topicId: selectedQuest.id || normalizeSubjectName(selectedQuest.title), subjectId: selectedQuest.subjectId || matchSubject(selectedQuest.subject, subjectsList)?.id || "unsorted" })} onComplete={completeQuest} onTutor={(context) => { setPage("tutor"); sendMessage(`I am studying ${selectedQuest.title} in ${selectedQuest.subject}. Use this saved learning context: ${context}. Teach the relevant basics, ask me to explain my reasoning, and help me repair the specific gap.`); }} onBack={() => setPage("quests")} />}
        {page === "progress" && <Progress stats={battleStats} xp={xp} onRevise={startQuest} />}
        {page === "settings" && <SettingsPage onExport={exportProgress} onImport={importProgress} onReset={() => { localStorage.removeItem("sd:v2"); localStorage.removeItem("study-dungeon-stats"); localStorage.removeItem("study-dungeon-xp"); localStorage.removeItem("study-dungeon-custom-topics"); window.location.reload(); }} />}
        {page === "subjects" && <Subjects setPage={goPage} subjectsList={subjectsList} customTopics={customTopics} battleStats={battleStats} openSubject={openSubject} autoOrganize={async()=>{const result=await classifyTopics(customTopics,subjectsList);setSubjectsList(result.subjects);setCustomTopics(current=>current.map(t=>result.mapping[t.id]?{...t,subjectId:result.mapping[t.id],subject:result.subjects.find(s=>s.id===result.mapping[t.id])?.name||"Unsorted"}:t));}} />}
        {page === "subject" && <SubjectDetail subject={subjectsList.find(s=>s.id===selectedSubjectId)} subjectsList={subjectsList} setSubjectsList={setSubjectsList} topics={customTopics} setTopics={setCustomTopics} setBattleStats={setBattleStats} attempts={battleStats.attempts||[]} completed={battleStats.completedQuests||[]} openSubject={openSubject} startQuest={startQuest} setPage={goPage} />}
        {page === "topics" && <Topics topics={customTopics} setTopics={setCustomTopics} subjectsList={subjectsList} setSubjectsList={setSubjectsList} setBattleStats={setBattleStats} startQuest={startQuest} startLearning={(topic, mode) => {
          const prompts = {
            basics: `Create a personalized learning path for my custom topic: ${topic}. Start from prerequisites and basics, teach one small concept at a time, give a worked example, then ask me to explain it in my own words. Diagnose my strengths and gaps from my answers and reasoning; do not assume mastery without evidence.`,
            quiz: `Run an adaptive diagnostic quiz on my custom topic: ${topic}. Ask one question at a time, starting with fundamentals. Ask me to explain my reasoning, not just give the answer. After each response, explain mistakes kindly, record the demonstrated strengths and gaps in this conversation, and adapt the next question.`,
            task: `Create a specialized hands-on task quest for my custom topic: ${topic}. Start with a beginner task, provide clear completion criteria and hints that do not reveal the answer, then review my solution and reasoning. Increase difficulty only when I demonstrate understanding.`,
            mastery: `Run a mastery check for my custom topic: ${topic}. Test prerequisites, conceptual understanding, application, and transfer to a new example one question at a time. Ask for reasoning, diagnose misconceptions, then summarize evidence-based strengths, weak areas, and a targeted next-step plan.`
          };
          setPage("tutor");
          sendMessage(prompts[mode]);
        }} />}
        {page === "achievements" && <Achievements xp={xp} stats={battleStats} />}
      </main>
    </div>
  );
}

function Dashboard({ setPage, startQuest, xp, battleStats, customTopics, subjectsList = SEED_SUBJECTS, openSubject = () => {} }) {
  const [subjectFilter,setSubjectFilter] = useState("all");
  const level = Math.floor(xp / 500) + 1;
  const attempts = battleStats?.attempts || [];
  const correctCount = attempts.filter(a => a.correct).length;
  const measuredAccuracy = attempts.length ? Math.round(correctCount / attempts.length * 100) : null;
  const topicScores = Object.entries(attempts.reduce((acc,a)=>{ const key=a.topic||"Unknown topic"; acc[key] ||= {total:0,correct:0}; acc[key].total++; if(a.correct) acc[key].correct++; return acc; },{})).map(([name,v])=>({name,accuracy:Math.round(v.correct/v.total*100),total:v.total})).sort((a,b)=>a.accuracy-b.accuracy);
  const weakest = topicScores.find(topic => topic.total >= 3);
  const activeTopic = (customTopics||[]).find(t => (t.stageIndex||0) < (t.path?.length||6) && !t.stageProgress?.[t.path?.[(t.path?.length||1)-1]?.id]?.cleared);
  return (
    <div className="content">
      <section className="hero">
        <div className="hero-glow" />
        <div className="hero-copy">
          <div className="eyebrow"><Sparkles size={14} /> YOUR LEARNING REALM</div>
          <h1>Forge your knowledge.<br /><em>Conquer every concept.</em></h1>
          <p>Your AI-powered study companion turns difficult subjects into quests, battles, and mastery.</p>
          <div className="hero-actions">
            <button className="primary" onClick={() => setPage("tutor")}>
              <MessageSquare size={17} /> Enter AI Tutor
            </button>
            <button className="secondary" onClick={() => setPage("quests")}>
              <Swords size={17} /> Continue Quest
            </button>
          </div>
        </div>
        <div className="hero-orb">
          <div className="orb-inner"><Brain size={54} /><span>AI</span></div>
        </div>
      </section>

      <section className="stat-grid">
        <Stat icon={Flame} label="Current Streak" value="Not tracked" sub="Study today to begin" />
        <Stat icon={Zap} label="Total XP" value={xp.toLocaleString()} sub={`${Math.max(0, level * 500 - xp)} to next level`} />
        <Stat icon={Target} label="Answer Accuracy" value={measuredAccuracy === null ? "—" : `${measuredAccuracy}%`} sub={attempts.length ? `${attempts.length} recorded attempts` : "No attempts recorded yet"} />
        <Stat icon={Trophy} label="Stages Cleared" value={(battleStats.completedQuests||[]).length} sub="From completed stage gates" />
      </section>

      <section className="dashboard-focus">
        <div className="mission-card">
          <div className="mission-top">
            <div>
              <div className="eyebrow"><Star size={13} /> TODAY'S MISSION</div>
              <h2>{activeTopic ? `Continue ${activeTopic.name}` : "Choose your first dungeon"}</h2>
              <p>{activeTopic ? `Resume Stage ${(activeTopic.stageIndex||0)+1}: ${activeTopic.path?.[activeTopic.stageIndex||0]?.title || "Foundations"}.` : "Add a custom topic to generate a personalized learning path."}</p>
            </div>
            <div className="mission-xp"><Zap size={14} /> Learning path</div>
          </div>

          <div className="mission-progress-row">
            <div className="mission-progress">
              <span style={{ width: `${activeTopic ? Math.round((Object.values(activeTopic.stageProgress||{}).filter(stage=>stage.cleared).length)/(activeTopic.path?.length||5)*100) : 0}%` }} />
            </div>
            <b>{activeTopic ? `${Math.round((Object.values(activeTopic.stageProgress||{}).filter(stage=>stage.cleared).length)/(activeTopic.path?.length||5)*100)}%` : "0%"}</b>
          </div>

          <div className="mission-steps">
            <span className={activeTopic ? "complete" : "current"}><CheckCircle2 size={14} /> Path</span>
            <span><BookOpen size={14} /> Lesson</span>
            <span><Clock3 size={14} /> Practice</span>
            <span><Target size={14} /> Master</span>
          </div>

          <button className="mission-button" onClick={() => activeTopic ? startQuest({ ...activeTopic, title: activeTopic.name, xp: 120, difficulty: activeTopic.level === "Beginner" ? "Easy" : "Medium", progress: 0, icon: GraduationCap, customTopic: true }) : setPage("topics")}>
            {activeTopic ? "Continue where you left off" : "Create your first topic"} <ChevronRight size={16} />
          </button>
        </div>

        <div className="weak-card">
          <div className="card-heading">
            <div>
              <div className="eyebrow"><TrendingUp size={13} /> FOCUS AREAS</div>
              <h3>Weakest Skills</h3>
            </div>
            <span className="focus-badge">AI PICK</span>
          </div>

          {weakest ? <><WeakSkill name={weakest.name} value={weakest.accuracy} color="amber" /><p className="muted">Based on {weakest.total} recorded attempts.</p></> : <p className="muted">Complete a few battles to reveal evidence-based strengths and weak areas.</p>}

          <button className="text-btn focus-link" onClick={() => weakest ? startQuest({title:weakest.name,subject:"Targeted revision",xp:120,difficulty:"Easy",progress:weakest.accuracy,icon:Brain}) : setPage("topics")}>
            {weakest ? "Generate revision quest" : "Add a topic to begin"} <ChevronRight size={14} />
          </button>
        </div>
      </section>

      <SectionHead
        title="Active Quests"
        eyebrow="CONTINUE YOUR JOURNEY"
        action="View all"
        onClick={() => setPage("quests")}
      />

      <div className="subject-filter-chips" role="group" aria-label="Filter dashboard quests by subject"><button className={subjectFilter==="all"?"active":""} onClick={()=>setSubjectFilter("all")}>All</button>{subjectsList.filter(s=>s.id!=="unsorted").map(s=><button key={s.id} className={subjectFilter===s.id?"active":""} onClick={()=>setSubjectFilter(s.id)}>{s.name}</button>)}</div>
      <div className="quest-grid">
        {quests.filter(q=>subjectFilter==="all"||q.subjectId===subjectFilter).map((q, i) => {const qa=attempts.filter(a=>a.topicId===q.id||normalizeSubjectName(a.topic)===normalizeSubjectName(q.title));const acc=qa.length?Math.round(qa.filter(a=>a.correct).length/qa.length*100):null;const subjectName=subjectsList.find(s=>s.id===q.subjectId)?.name||q.subject;return <QuestCard key={q.title} q={{...q,subject:subjectName,accuracy:acc,progress:acc??0}} index={i} onStart={() => startQuest(q)} />;})}
      </div>

      <SectionHead
        title="Subjects"
        eyebrow="YOUR KNOWLEDGE MAP"
        action="Explore"
        onClick={() => setPage("subjects")}
      />

      <div className="subject-grid">
        {subjectsList.filter(s=>s.id!=="unsorted").slice(0,6).map(s => { const a=aggregateSubject(s.id,customTopics,battleStats?.attempts||[],battleStats?.completedQuests||[]); return <SubjectCard key={s.id} s={{...s,...a,topicCount:a.topicCount+quests.filter(q=>q.subjectId===s.id).length,currentStage:(customTopics.find(t=>t.subjectId===s.id&&t.path?.length)?.name?`Active: ${customTopics.find(t=>t.subjectId===s.id&&t.path?.length)?.name} · Stage ${(customTopics.find(t=>t.subjectId===s.id&&t.path?.length)?.stageIndex||0)+1}`:undefined)}} onClick={()=>openSubject(s.id)} />; })}
      </div>
    </div>
  );
}

function WeakSkill({ name, value, color }) {
  return (
    <div className="weak-skill">
      <div className="weak-skill-top">
        <span>{name}</span>
        <b>{value}%</b>
      </div>
      <div className="weak-bar">
        <span className={color} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function SectionHead({ title, eyebrow, action, onClick }) {
  return (
    <div className="section-head">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h2>{title}</h2>
      </div>
      <button className="text-btn" onClick={onClick}>
        {action} <ChevronRight size={15} />
      </button>
    </div>
  );
}

function Stat({ icon: Icon, label, value, sub }) {
  return (
    <div className="stat-card">
      <div className="stat-icon"><Icon size={18} /></div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{sub}</small>
      </div>
    </div>
  );
}

function QuestCard({ q, index, onStart }) {
  const Icon = q.icon;
  return (
    <article
      className={`quest-card ${onStart ? "quest-card-clickable" : ""}`}
      onClick={onStart}
      onKeyDown={event => {
        if (onStart && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          onStart();
        }
      }}
      role={onStart ? "button" : undefined}
      tabIndex={onStart ? 0 : undefined}
      aria-label={onStart ? `Start ${q.title} quest` : undefined}
    >
      <div className={`quest-icon q${index}`}><Icon size={21} /></div>
      <div className="quest-main">
        <div className="quest-title">
          <b>{q.title}</b>
          <span className={`difficulty ${q.difficulty.toLowerCase()}`}>{q.difficulty}</span>
        </div>
        <span className="muted">{q.subject}</span><span className="subject-badge">{q.subject}</span>
        <div className="bar"><span style={{ width: `${q.progress}%` }} /></div>
        <div className="quest-meta">
          <span>{q.accuracy != null ? `${q.accuracy}% accuracy` : "No assessment yet"}</span>
          <span><Zap size={12} />{q.xp} XP</span>
        </div>
      </div>
      <button className="round-btn" type="button" aria-label={`Start ${q.title} quest`} onClick={event => { event.stopPropagation(); onStart?.(); }}><ChevronRight size={17} /></button>
    </article>
  );
}

function SubjectCard({ s, onClick }) {
  const Icon = subjectIconMap[s.icon] || BookOpen;
  return <button type="button" className={`subject-card ${s.color||"violet"} subject-card-button`} onClick={onClick} aria-label={`Open ${s.name} dungeon`}>
    <div className="subject-top"><div className="subject-icon"><Icon size={19}/></div><span>{s.topicCount ?? s.topics ?? 0} topics</span></div>
    <b>{s.name}</b><div className="subject-foot"><span>{s.currentStage || (s.accuracy == null ? "No assessment yet" : `${s.accuracy}% accuracy`)}</span><div className="tiny-bar"><i style={{width:`${s.accuracy ?? 0}%`}}/></div></div>
  </button>;
}

function CodeBlock({ children }) {
  const rawCode = children?.props?.children;
  const className = children?.props?.className || "";
  const language = className.replace("language-", "") || "code";
  const codeText = String(rawCode ?? "").replace(/\n$/, "");

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(codeText);
    } catch {
      // Clipboard access can be blocked by the browser; no UI error needed.
    }
  }

  return (
    <div className="code-block">
      <div className="code-header">
        <span>{language}</span>
        <button type="button" onClick={copyCode} aria-label="Copy code">Copy</button>
      </div>
      <pre><code className={className}>{codeText}</code></pre>
    </div>
  );
}

function Tutor({ chat, input, setInput, sendMessage, isThinking }) {
  const suggestions = [
    "Explain Fourier Transform like I'm a beginner",
    "Show me Python for this concept",
    "Quiz me on Signals & Systems"
  ];

  return (
    <div className="content tutor-page">
      <div className="tutor-header">
        <div>
          <div className="eyebrow"><span className="live-dot" /> AI LEARNING COMPANION</div>
          <h1>AI Tutor</h1>
          <p>Ask anything. Learn step-by-step. Your conversation stays connected.</p>
        </div>
        <div className="tutor-status"><Brain size={18} /><span>Context aware</span></div>
      </div>

      <div className="tutor-layout">
        <section className="chat-panel">
          <div className="chat-top">
            <div className="ai-avatar"><Sparkles size={18} /></div>
            <div><b>Dungeon Guide</b><span>Adaptive AI Tutor</span></div>
            <div className="online">ONLINE</div>
          </div>

          <div className="messages">
            {chat.map((message, index) => (
              <div className={`message-row ${message.role}`} key={index}>
                <div className={message.role === "assistant" ? "ai-small" : "user-small"}>
                  {message.role === "assistant" ? <Brain size={15} /> : <UserRound size={15} />}
                </div>
                <div className="bubble">
                  <span className="role-label">
                    {message.role === "assistant" ? "DUNGEON GUIDE" : "YOU"}
                  </span>
                  {message.text ? (
                    <div className="markdown-body">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          a: ({ node, ...props }) => (
                            <a {...props} target="_blank" rel="noreferrer" />
                          ),
                          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
                          code: ({ className, children, ...props }) => {
                            const isBlock = Boolean(className && className.startsWith("language-"));
                            if (!isBlock) return <code className="inline-code" {...props}>{children}</code>;
                            return <code className={className} {...props}>{children}</code>;
                          }
                        }}
                      >
                        {message.text}
                      </ReactMarkdown>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}

            {isThinking && (
              <div className="message-row assistant">
                <div className="ai-small"><Brain size={15} /></div>
                <div className="bubble thinking-bubble">
                  <span className="role-label">DUNGEON GUIDE</span>
                  <div className="thinking"><i /><i /><i /><span>Thinking...</span></div>
                </div>
              </div>
            )}
          </div>

          <div className="suggestions">
            {suggestions.map(suggestion => (
              <button key={suggestion} onClick={() => sendMessage(suggestion)}>
                {suggestion}
              </button>
            ))}
          </div>

          <form
            className="composer"
            onSubmit={event => {
              event.preventDefault();
              sendMessage();
            }}
          >
            <input
              value={input}
              onChange={event => setInput(event.target.value)}
              disabled={isThinking}
              placeholder={isThinking ? "Dungeon Guide is thinking..." : "Ask your tutor anything..."}
            />
            <button className="send" type="submit" aria-label="Send message" disabled={isThinking}><Send size={18} /></button>
          </form>
        </section>

        <aside className="tutor-side">
          <div className="side-card">
            <div className="card-title"><Target size={16} /> Study mode</div>
            <button className="mode active" onClick={() => sendMessage("Use Concept Learning mode: explain intuitively, then give one worked example and check my understanding.")}>Concept Learning <CheckCircle2 size={15} /></button>
            <button className="mode" onClick={() => sendMessage("Switch to Exam Practice mode. Ask one exam-style question at a time and assess my reasoning.")}>Exam Practice</button>
            <button className="mode" onClick={() => sendMessage("Switch to Code Lab mode. Give me a small coding task, hints, and review my solution.")}>Code Lab</button>
          </div>

          <div className="side-card">
            <div className="card-title"><Zap size={16} /> Session XP</div>
            <div className="session-xp">Earn XP <small>in battles</small></div>
            
            <small className="muted">Correct answers in study battles award XP.</small>
          </div>

          <div className="side-card">
            <div className="card-title"><BookOpen size={16} /> Quick tools</div>
            <button className="tool" onClick={() => sendMessage("Help me identify the key formulas for my current topic. Explain each symbol simply and show one short example.")}><Calculator size={15} /> Formula helper</button>
            <button className="tool" onClick={() => sendMessage("Give me a concise, runnable code example for my current topic and explain the important lines.")}><Code2 size={15} /> Code example</button>
            <button className="tool" onClick={() => sendMessage("Start a mini quiz on my current topic. Ask one question at a time and wait for my answer.")}><Gamepad2 size={15} /> Start mini quiz</button>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Quests({ setPage, startQuest, customTopics = [], subjectsList=SEED_SUBJECTS, battleStats={attempts:[],completedQuests:[]} }) {
  const [filter,setFilter]=useState("all");
  const allQuests = [
    ...quests,
    { title: "Digital Image Processing", subject: "ECE Core", xp: 180, difficulty: "Hard", icon: Brain, progress: 0 },
    ...customTopics.map(topic => ({
      ...topic, title: topic.name,
      subject: subjectsList.find(s=>s.id===topic.subjectId)?.name || topic.subject || "Unsorted", subjectId: topic.subjectId || "unsorted", id:topic.id,
      xp: 120,
      difficulty: topic.level === "Beginner" ? "Easy" : topic.level === "Intermediate" ? "Medium" : "Hard",
      icon: GraduationCap,
      progress: 0,
      goal: topic.goal,
      customTopic: true
    }))
  ];

  return (
    <div className="content">
      <div className="page-heading">
        <div>
          <div className="eyebrow">ADVENTURE BOARD</div>
          <h1>Quests</h1>
          <p>Turn your syllabus into a series of conquerable missions.</p>
        </div>
        <button className="primary" onClick={() => setPage("topics")}><Swords size={17} /> New Quest</button>
      </div>

      <div className="subject-filter-chips" role="group" aria-label="Filter quests by subject"><button className={filter==="all"?"active":""} onClick={()=>setFilter("all")}>All</button>{subjectsList.map(s=><button key={s.id} className={filter===s.id?"active":""} onClick={()=>setFilter(s.id)}>{s.name}</button>)}</div>
      <div className="quest-list">
        {allQuests.filter(q=>filter==="all"||q.subjectId===filter).map((q, i) => {const qa=(battleStats.attempts||[]).filter(a=>a.topicId===q.id||normalizeSubjectName(a.topic)===normalizeSubjectName(q.title));const accuracy=qa.length?Math.round(qa.filter(a=>a.correct).length/qa.length*100):null;return <QuestCard q={{...q,progress:accuracy??q.progress,subject:subjectsList.find(s=>s.id===q.subjectId)?.name||q.subject,accuracy}} index={i % 3} key={q.id||q.title} onStart={() => startQuest(q)} />;})}
      </div>

      <div className="empty-cta">
        <Sparkles size={26} />
        <h3>Need a custom quest?</h3>
        <p>Tell the AI Tutor your exam date and syllabus. It can turn them into a personalized learning path.</p>
        <button className="secondary" onClick={() => setPage("tutor")}>Ask the AI Tutor</button>
      </div>
    </div>
  );
}


function Journey({ topic, onSave, onAttempt, onComplete, onTutor, onBack }) {
  const savedStage = topic.stageProgress?.[topic.path?.[topic.stageIndex || 0]?.id] || {};
  const [path, setPath] = useState(topic.path || null);
  const [stageIndex, setStageIndex] = useState(Number(topic.stageIndex || 0));
  const [lesson, setLesson] = useState(null);
  const [questions, setQuestions] = useState(savedStage.questions || []);
  const [quizSessionId, setQuizSessionId] = useState(savedStage.quizSessionId || "");
  const [questionIndex, setQuestionIndex] = useState(savedStage.questionIndex || 0);
  const [answer, setAnswer] = useState(savedStage.answer || "");
  const [feedback, setFeedback] = useState(savedStage.feedback || null);
  const [attempts, setAttempts] = useState(savedStage.attempts || []);
  const [missedConcepts, setMissedConcepts] = useState(savedStage.missedConcepts || []);
  const [remedialReady, setRemedialReady] = useState(false);
  const [correctAfterWrong, setCorrectAfterWrong] = useState(savedStage.correctAfterWrong || []);
  const [wrongOccurred, setWrongOccurred] = useState(Boolean(savedStage.wrongOccurred));
  const [phase, setPhase] = useState(savedStage.questions?.length ? (savedStage.feedback ? "answer-feedback" : "practice") : "loading-path");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [hintIndex, setHintIndex] = useState(-1);
  const [answerText, setAnswerText] = useState(savedStage.answerText || "");
  const currentStage = path?.[stageIndex];
  const currentQuestion = questions[questionIndex];

  async function ensurePath() {
    if (path?.length >= 4) {
      if (savedStage.questions?.length && savedStage.quizSessionId) setPhase(savedStage.feedback ? "answer-feedback" : "practice");
      else {
        setPhase("stage");
        if (topic.initialMode && topic.initialMode !== "basics") loadQuiz(topic.initialMode === "mastery" ? currentStage?.concepts || [] : []);
        else loadLesson();
      }
      return;
    }
    setLoading(true); setError("");
    try {
      const r = await fetch("/api/path/generate", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({topic:topic.title||topic.name,subject:topic.subject,level:topic.level||"Beginner",goal:topic.goal||"Understand the topic and apply it",notes:topic.notes||""}) });
      const d=await r.json(); if(!r.ok) throw new Error(d.error||"Could not generate path.");
      setPath(d.stages); const updated={...topic,path:d.stages,pathSummary:d.summary,stageIndex:0}; onSave(updated); setPhase("stage");
    } catch(e) { setError(e.message); setPhase("error"); }
    finally { setLoading(false); }
  }
  async function loadLesson() {
    if (!currentStage) return;
    setLoading(true); setError("");
    try {
      const cached=topic.stageProgress?.[currentStage.id]?.lesson;
      if(cached) { setLesson(cached); setPhase("lesson"); return; }
      const r=await fetch("/api/lesson/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({topic:topic.title||topic.name,stage:currentStage,level:topic.level||"Beginner",goal:topic.goal,notes:topic.notes})});
      const d=await r.json(); if(!r.ok) throw new Error(d.error||"Could not generate lesson.");
      setLesson(d); setPhase("lesson");
      const updated={...topic,stageProgress:{...(topic.stageProgress||{}),[currentStage.id]:{...(topic.stageProgress?.[currentStage.id]||{}),lesson:d}}}; onSave(updated);
    } catch(e) { setError(e.message); setPhase("error"); } finally { setLoading(false); }
  }
  async function loadQuiz(missed=[]) {
    if(!currentStage) return;
    setLoading(true); setError("");
    try {
      const sid=`${topic.id||topic.title}-${currentStage.id}-${Date.now()}`;
      const r=await fetch("/api/quiz/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({topic:topic.title||topic.name,stage:currentStage,level:topic.level||"Beginner",count:stageIndex===path.length-1?12:8,missedConcepts:missed,sessionId:sid})});
      const d=await r.json(); if(!r.ok) throw new Error(d.error||"Could not generate practice questions.");
      setQuestions(d.questions); setQuizSessionId(d.sessionId); setQuestionIndex(0); setAnswer(""); setAnswerText(""); setFeedback(null); setHintIndex(-1); setAttempts([]); setCorrectAfterWrong([]); setMissedConcepts([]); setWrongOccurred(false); setPhase(missed.length?"remedial-practice":"practice");
      onSave({ ...topic, stageIndex, stageProgress: { ...(topic.stageProgress||{}), [currentStage.id]: { ...(topic.stageProgress?.[currentStage.id]||{}), questions:d.questions, quizSessionId:d.sessionId, questionIndex:0, attempts:[], missedConcepts:[], correctAfterWrong:[], wrongOccurred:false, answer:"", answerText:"", feedback:null } } });
    } catch(e) { setError(e.message); setPhase("error"); } finally { setLoading(false); }
  }
  async function submitAnswer() {
    if(!currentQuestion || (currentQuestion.type==="short_answer" ? !answerText.trim() : answer==="")) return;
    setLoading(true); setError("");
    try {
      const r=await fetch("/api/quiz/answer",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({sessionId:quizSessionId,questionId:currentQuestion.id,answer:currentQuestion.type==="short_answer"?answerText:Number(answer)})});
      const d=await r.json(); if(!r.ok) throw new Error(d.error||"Could not check your answer.");
      const attempt={topic:topic.title||topic.name,concept:d.concept||currentQuestion.concept,correct:d.correct,score:d.score,at:new Date().toISOString(),stageId:currentStage.id};
      const nextAttempts=[...attempts,attempt]; setAttempts(nextAttempts); setFeedback(d); onAttempt({topic:attempt.topic,concept:attempt.concept,correct:d.correct,difficulty:currentQuestion.difficulty,xp:d.correct?(currentQuestion.difficulty==="hard"?50:currentQuestion.difficulty==="medium"?30:20):0,at:attempt.at});
      const nextMissed = d.correct ? missedConcepts : [...new Set([...missedConcepts,attempt.concept])];
      const nextRecovered = d.correct && wrongOccurred ? [...new Set([...correctAfterWrong,attempt.concept])] : correctAfterWrong;
      const nextWrongOccurred = wrongOccurred || !d.correct;
      if(d.correct) { if(wrongOccurred) setCorrectAfterWrong(nextRecovered); }
      else { setMissedConcepts(nextMissed); setWrongOccurred(true); }
      onSave({ ...topic, stageIndex, stageProgress: { ...(topic.stageProgress||{}), [currentStage.id]: { ...(topic.stageProgress?.[currentStage.id]||{}), attempts: nextAttempts, missedConcepts: nextMissed, correctAfterWrong: nextRecovered, wrongOccurred: nextWrongOccurred, lesson: lesson || topic.stageProgress?.[currentStage.id]?.lesson, questions, quizSessionId, questionIndex, answer, answerText, feedback:d } } });
      setPhase("answer-feedback");
    } catch(e) { setError(e.message); } finally { setLoading(false); }
  }
  function nextQuestion() {
    if(questionIndex+1<questions.length) { const nextIndex=questionIndex+1; setQuestionIndex(nextIndex);setAnswer("");setAnswerText("");setFeedback(null);setHintIndex(-1);setPhase("practice"); onSave({ ...topic, stageIndex, stageProgress: { ...(topic.stageProgress||{}), [currentStage.id]: { ...(topic.stageProgress?.[currentStage.id]||{}), questions, quizSessionId, questionIndex:nextIndex, attempts, missedConcepts, correctAfterWrong, wrongOccurred, answer:"", answerText:"", feedback:null } } });return; }
    const accuracy=attempts.length?attempts.filter(a=>a.correct).length/attempts.length:0;
    const gate=evaluateStageGate(attempts, correctAfterWrong, stageIndex === path.length - 1).passed;
    if(gate) { setPhase("stage-cleared"); const updated={...topic,stageIndex:Math.min(stageIndex+1,path.length-1),stageProgress:{...(topic.stageProgress||{}),[currentStage.id]:{...(topic.stageProgress?.[currentStage.id]||{}),cleared:true,accuracy:Math.round(accuracy*100),attempts}}}; onSave(updated); onComplete(`${topic.title||topic.name} — ${currentStage.title}`); }
    else setPhase("gate-failed");
  }
  async function startRemedial() {
    if(!missedConcepts.length) { setError("No missed concept tags were recorded. Retry the practice set to gather more evidence.");return; }
    setLoading(true);setError("");
    try {
      const r=await fetch("/api/remedial/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({topic:topic.title||topic.name,missedConcepts})});
      const d=await r.json(); if(!r.ok) throw new Error(d.error||"Could not generate remedial lesson.");
      setLesson(d.lesson); setRemedialReady(true); setPhase("lesson"); onSave({ ...topic, stageProgress: { ...(topic.stageProgress||{}), [currentStage.id]: { ...(topic.stageProgress?.[currentStage.id]||{}), lesson:d.lesson, remedialConcepts:missedConcepts } } });
    } catch(e) { setError(e.message); } finally { setLoading(false); }
  }
  React.useEffect(()=>{ ensurePath(); },[]);
  React.useEffect(()=>{ if(phase==="stage"&&currentStage) { if(topic.initialMode && topic.initialMode!=="basics" && !savedStage.questions?.length) loadQuiz(topic.initialMode==="mastery"?currentStage.concepts||[]:[]); else loadLesson(); } },[stageIndex,path?.length]);

  if(phase==="loading-path"||loading&&phase!=="practice"&&phase!=="answer-feedback") return <div className="content"><div className="page-heading"><div><div className="eyebrow">BUILDING YOUR DUNGEON</div><h1>{topic.title||topic.name}</h1><p>Generating a topic-specific learning path and checking its structure...</p></div></div><div className="topic-empty"><Sparkles size={28}/><h3>{loading?"The Dungeon Guide is preparing your path…":"Loading your learning journey…"}</h3><p>This can take a little while while the AI builds stages around your goal.</p></div></div>;
  if(phase==="error") return <div className="content"><div className="page-heading"><div><div className="eyebrow">DUNGEON CONNECTION</div><h1>{topic.title||topic.name}</h1><p>The path or activity could not be generated.</p></div></div><div className="battle-feedback bad"><p>{error}</p><button className="secondary" onClick={()=>{setError("");if(!path)ensurePath();else if(lesson)loadQuiz();else loadLesson();}}>Retry</button></div><button className="secondary" onClick={onBack}>Back to quests</button></div>;
  if(phase==="stage"||phase==="lesson") return <div className="content journey-page"><div className="page-heading"><div><div className="eyebrow">DUNGEON JOURNEY · STAGE {stageIndex+1} OF {path.length}</div><h1>{topic.title||topic.name}</h1><p>{topic.pathSummary||"A learning path built around your topic, level and goal."}</p></div><button className="secondary" onClick={onBack}>Exit dungeon</button></div><div className="journey-map">{path.map((stage,i)=><button key={stage.id} className={`journey-node ${i<stageIndex?"cleared":i===stageIndex?"current":"locked"}`} disabled={i>stageIndex} onClick={()=>{if(i<=stageIndex){setStageIndex(i);setPhase("stage");}}}><span>{i<stageIndex?<CheckCircle2 size={18}/>:i===path.length-1?<Trophy size={18}/>:i+1}</span><b>{stage.title}</b><small>{i<stageIndex?"Cleared":i===stageIndex?"Current stage":"Locked"}</small></button>)}</div>{currentStage&&<section className="lesson-panel"><div className="eyebrow">STAGE OBJECTIVE</div><h2>{currentStage.title}</h2><p>{currentStage.objective}</p><div className="concept-chips">{currentStage.concepts.map(c=><span key={c}>{c}</span>)}</div>{lesson?.microLessons?.map((m,i)=><article className="micro-lesson" key={`${currentStage.id}-${i}`}><h3>{i+1}. {m.heading}</h3><p>{m.explanation}</p><div className="lesson-callout"><b>Think of it this way</b><p>{m.analogy}</p></div><div className="worked-example"><b>Worked example</b><p>{m.example}</p></div><p className="check-yourself"><b>Check yourself:</b> {m.checkYourself}</p><div className="lesson-actions"><button className="secondary" onClick={()=>onTutor(`Stage: ${currentStage.title}. Concept: ${m.heading}. Please explain this differently using a simpler analogy.`)}>Explain differently</button><button className="secondary" onClick={()=>onTutor(`Stage: ${currentStage.title}. Concept: ${m.heading}. Please give me another worked example, then ask me to try one.`)}>Give another example</button></div></article>)}<button className="primary" disabled={loading} onClick={()=>loadQuiz()}><Swords size={16}/> Start stage practice ({stageIndex===path.length-1?12:8} questions)</button></section>}</div>;
  if(phase==="practice"||phase==="answer-feedback"||phase==="remedial-practice") return <div className="content journey-page"><div className="page-heading"><div><div className="eyebrow">STAGE GATE · {stageIndex===path.length-1?"BOSS BATTLE":"PRACTICE"}</div><h1>{currentStage.title}</h1><p>Question {questionIndex+1} of {questions.length}. Explain your reasoning for short answers.</p></div><button className="secondary" onClick={()=>setPhase("lesson")}>Back to lesson</button></div><div className="battle-layout"><section className="battle-card"><div className="monster-health"><div><span>GUARDIAN HP</span><b>{Math.max(0,100-Math.round(attempts.filter(a=>a.correct).length/questions.length*100))}%</b></div><div className="bar"><span style={{width:`${Math.max(0,100-attempts.filter(a=>a.correct).length/questions.length*100)}%`}}/></div></div><div className="battle-question"><span className="eyebrow">{currentQuestion?.concept} · {currentQuestion?.difficulty}</span><h2>{currentQuestion?.question}</h2>{currentQuestion?.type==="short_answer"?<textarea rows={4} value={answerText} disabled={phase==="answer-feedback"} onChange={e=>setAnswerText(e.target.value)} placeholder="Write your answer and reasoning..."/>:<div className="battle-options">{(currentQuestion?.options||[]).map((option,i)=><button key={`${currentQuestion.id}-${i}`} disabled={phase==="answer-feedback"} className={`battle-option ${answer===String(i)?"selected":""} ${phase==="answer-feedback"&&feedback?.correct&&answer===String(i)?"correct":""}`} onClick={()=>setAnswer(String(i))}><span>{String.fromCharCode(65+i)}</span>{option}</button>)}</div>}</div>{hintIndex>=0&&<div className="hint-panel"><Sparkles size={16}/>{currentQuestion?.hints?.[hintIndex]||"Focus on the key concept and rule out options that do not match it."}</div>}{phase==="answer-feedback"&&<div className={`battle-feedback ${feedback?.correct?"good":"bad"}`} aria-live="polite"><b>{feedback?.correct?"⚔️ Correct — good reasoning!":"💥 Not quite. Let's learn from it."}</b><p>{feedback?.feedback}</p>{feedback?.misconception&&<p><b>Watch for:</b> {feedback.misconception}</p>}<button className="text-btn" onClick={()=>onTutor(`Question: ${currentQuestion.question}. My answer: ${currentQuestion.type==="short_answer"?answerText:currentQuestion.options[Number(answer)]}. Feedback: ${feedback?.feedback}. Concept: ${currentQuestion.concept}. Please teach this concept and diagnose my reasoning.`)}>Ask the tutor about this question <ChevronRight size={14}/></button></div>}<div className="battle-controls">{phase!=="answer-feedback"?<><button className="secondary" onClick={()=>setHintIndex(v=>Math.min(2,v+1))}><Sparkles size={15}/> Hint {hintIndex<0?"":hintIndex+1}/3</button><button className="primary" disabled={loading||(currentQuestion?.type==="short_answer"?!answerText.trim():answer==="")} onClick={submitAnswer}>{loading?"Checking…":"Submit answer"} <Swords size={16}/></button></>:<button className="primary" onClick={nextQuestion}>{questionIndex+1===questions.length?"Check stage gate":"Next question"}<ChevronRight size={16}/></button>}</div>{error&&<p className="form-error">{error}</p>}</section><aside className="battle-sidebar"><div className="side-card"><div className="card-title"><Target size={16}/> Your evidence</div><p>Correct: {attempts.filter(a=>a.correct).length} / {attempts.length}</p><p>Missed concepts: {missedConcepts.length?missedConcepts.join(", "):"None recorded yet"}</p><p className="muted">The correct option stays on the server until you submit your answer.</p></div></aside></div></div>;
  if(phase==="gate-failed") return <div className="content"><div className="battle-result"><div className="boss-emblem"><RefreshCw size={30}/></div><div className="eyebrow">STAGE GATE</div><h1>Not cleared yet</h1><p>You scored {Math.round(attempts.filter(a=>a.correct).length/Math.max(1,attempts.length)*100)}%. You need at least {stageIndex===path.length-1?80:75}% and evidence of correcting at least two concepts after a mistake.</p><p>We'll target these gaps: {missedConcepts.join(", ")||"The stage concepts need another check."}</p><div className="hero-actions"><button className="primary" onClick={()=>startRemedial()} disabled={loading}>{loading?"Generating targeted revision…":"Generate remedial lesson + fresh questions"}</button><button className="secondary" onClick={()=>{setAttempts([]);setPhase("lesson");}}>Review lesson</button></div>{error&&<p className="form-error">{error}</p>}</div></div>;
  if(phase==="stage-cleared") return <div className="content"><div className="battle-result"><div className="boss-emblem"><Trophy size={34}/></div><div className="eyebrow">GUARDIAN DEFEATED</div><h1>{stageIndex===path.length-1?"DUNGEON CONQUERED!":"Stage cleared!"}</h1><p>{stageIndex===path.length-1?`You defeated the final guardian for ${topic.title||topic.name}. Your mastery check is complete.`:`You met the gate requirements for ${currentStage.title}. Your next stage is now available.`}</p><div className="result-score">{Math.round(attempts.filter(a=>a.correct).length/Math.max(1,attempts.length)*100)}<span>%</span></div><div className="hero-actions">{stageIndex<path.length-1&&<button className="primary" onClick={()=>{const next=Math.min(stageIndex+1,path.length-1);setStageIndex(next);setLesson(null);setPhase("stage");setAttempts([]);setCorrectAfterWrong([]);setMissedConcepts([]);setWrongOccurred(false);}}>Enter next stage <ChevronRight size={16}/></button>}<button className="secondary" onClick={onBack}>{stageIndex===path.length-1?"Return to quests":"Back to quests"}</button></div></div></div>;
  return null;
}



function Progress({ stats, xp, onRevise }) {
  const attempts = stats?.attempts || [];
  const grouped = {};
  attempts.forEach(a => { grouped[a.topic] ||= { total: 0, correct: 0 }; grouped[a.topic].total++; if (a.correct) grouped[a.topic].correct++; });
  const rows = Object.entries(grouped).map(([topic,v])=>({topic,...v,accuracy:Math.round(v.correct/v.total*100)})).sort((a,b)=>a.accuracy-b.accuracy);
  const totalCorrect = attempts.filter(a=>a.correct).length;
  const accuracy = attempts.length ? Math.round(totalCorrect/attempts.length*100) : 0;
  return <div className="content"><div className="page-heading"><div><div className="eyebrow">PLAYER INTELLIGENCE</div><h1>Progress & Weaknesses</h1><p>Strengths and gaps are based on recorded answers—not guesses.</p></div></div><div className="stat-grid"><Stat icon={ClipboardCheck} label="Questions answered" value={attempts.length} sub="Across saved battles"/><Stat icon={Target} label="Accuracy" value={`${accuracy}%`} sub="Based on attempts"/><Stat icon={Zap} label="Total XP" value={xp.toLocaleString()} sub="Saved in this browser"/><Stat icon={Trophy} label="Quests cleared" value={(stats.completedQuests||[]).length} sub="Unique completed quests"/></div><section className="progress-panel"><div className="section-head"><div><div className="eyebrow">TOPIC MASTERY</div><h2>What to study next</h2></div></div>{rows.length===0?<div className="topic-empty"><BarChart3 size={25}/><h3>Your first battle will appear here</h3><p>Complete a quest to start building an evidence-based strengths and weaknesses profile.</p></div>:rows.map(r=><div className="progress-topic" key={r.topic}><div className="progress-topic-head"><div><b>{r.topic}</b><p>{r.correct}/{r.total} correct · {r.total<3?"Early evidence":r.accuracy>=80?"Current strength":r.accuracy<60?"Needs revision":"Developing"}</p></div><strong>{r.accuracy}%</strong></div><div className="bar"><span style={{width:`${r.accuracy}%`}}/></div><button className="text-btn" onClick={()=>onRevise({title:r.topic,subject:"Personalized revision",xp:100,difficulty:r.accuracy<60?"Easy":"Medium",progress:r.accuracy,icon:Brain})}>Generate revision quest <ChevronRight size={14}/></button></div>)}</section><p className="form-note">A small number of attempts is preliminary evidence. The app avoids labeling a skill as mastered from one answer.</p></div>;
}

function SettingsPage({ onReset, onExport, onImport }) {
  const [importError,setImportError] = useState("");
  const [importMessage,setImportMessage] = useState("");
  const [confirm,setConfirm] = useState(false);
  return <div className="content"><div className="page-heading"><div><div className="eyebrow">PLAYER PREFERENCES</div><h1>Settings</h1><p>Manage your local demo profile and learning data.</p></div></div><div className="settings-card"><div className="settings-row"><div><b>Progress backup</b><p>Export your learning paths and recorded attempts as JSON, or restore a previous export.</p></div><div className="settings-actions"><button className="secondary" onClick={onExport}>Export progress</button><label className="secondary import-label">Import JSON<input type="file" accept="application/json,.json" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;try{await onImport(file);setImportMessage("Progress imported successfully.");setImportError("");}catch(err){setImportError(err.message||"Could not import that file.");setImportMessage("");}e.target.value="";}} /></label></div></div>{importMessage&&<p className="success-note">{importMessage}</p>}{importError&&<p className="form-error">{importError}</p>}<div className="settings-row"><div><b>AI tutor connection</b><p>Gemini API requests are handled by the server. Keep your key in the private .env file.</p></div><span className="status-pill"><span className="live-dot"/> Server configured via .env</span></div><div className="settings-row"><div><b>Reset demo progress</b><p>Clear locally saved XP, attempts, and custom topics on this browser.</p></div>{!confirm?<button className="secondary" onClick={()=>setConfirm(true)}>Reset progress</button>:<div className="hero-actions"><button className="secondary" onClick={()=>setConfirm(false)}>Cancel</button><button className="primary" onClick={onReset}>Confirm reset</button></div>}</div></div></div>;
}

function Subjects({ setPage, subjectsList=SEED_SUBJECTS, customTopics=[], battleStats={attempts:[],completedQuests:[]}, openSubject, autoOrganize }) {
  const [organizing,setOrganizing]=useState(false); const [notice,setNotice]=useState("");
  async function runOrganize(){setOrganizing(true);setNotice("");try{await autoOrganize();setNotice("Unsorted topics were checked. Items without a confident match remain in Unsorted.");}catch{setNotice("Auto-organize could not reach the classifier. You can retry later.");}finally{setOrganizing(false);}}
  return <div className="content"><div className="page-heading"><div><div className="eyebrow">KNOWLEDGE MAP</div><h1>Dungeons</h1><p>Explore your subjects, see recorded learning activity, and continue a topic.</p></div><button className="primary" onClick={runOrganize} disabled={organizing}><Sparkles size={16}/>{organizing?"Organizing…":"Auto-organize all"}</button></div>
    {notice&&<p className="form-note" role="status">{notice}</p>}
    <div className="subject-grid large">{subjectsList.map(s=>{const a=aggregateSubject(s.id,customTopics,battleStats.attempts||[],battleStats.completedQuests||[]);return <SubjectCard key={s.id} s={{...s,...a,topicCount:a.topicCount+quests.filter(q=>q.subjectId===s.id).length,currentStage:(customTopics.find(t=>t.subjectId===s.id&&t.path?.length)?.name?`Active: ${customTopics.find(t=>t.subjectId===s.id&&t.path?.length)?.name} · Stage ${(customTopics.find(t=>t.subjectId===s.id&&t.path?.length)?.stageIndex||0)+1}`:undefined)}} onClick={()=>openSubject(s.id)}/>})}</div>
    <div className="section-head"><div><div className="eyebrow">PERSONAL SYLLABUS</div><h2>Quick actions</h2></div></div><div className="hero-actions"><button className="secondary" onClick={()=>setPage("topics")}>Add a topic</button></div>
  </div>;
}

function SubjectDetail({subject,subjectsList,setSubjectsList,topics,setTopics,setBattleStats,attempts,completed,openSubject,startQuest,setPage}) {
  const [newName,setNewName]=useState(""); const [rename,setRename]=useState(subject?.name||""); const [mergeTo,setMergeTo]=useState(""); const [notice,setNotice]=useState("");
  useEffect(()=>setRename(subject?.name||""),[subject?.id,subject?.name]);
  if(!subject) return <div className="content"><h1>Subject not found</h1><button className="primary" onClick={()=>setPage("subjects")}>Back to Dungeons</button></div>;
  const items=[...quests.filter(q=>q.subjectId===subject.id),...topics.filter(t=>t.subjectId===subject.id).map(t=>({...t,title:t.name,subject:subject.name,customTopic:true,icon:GraduationCap,xp:120,difficulty:t.level==="Beginner"?"Easy":t.level==="Intermediate"?"Medium":"Hard",progress:t.path?.length?Math.round((t.stageIndex||0)/t.path.length*100):0}))];
  const stats=aggregateSubject(subject.id,topics,attempts,completed); const lastActive=[...items].sort((a,b)=>(Number(b.stageIndex||0)+Number(b.lastActiveAt||0))-(Number(a.stageIndex||0)+Number(a.lastActiveAt||0)))[0]; const subjectAttempts=attempts.filter(a=>a.subjectId===subject.id); const conceptMap={}; subjectAttempts.forEach(a=>{const k=a.concept||a.topic||"General concepts";conceptMap[k] ||= {total:0,correct:0};conceptMap[k].total++;if(a.correct)conceptMap[k].correct++;}); const weak=Object.entries(conceptMap).map(([name,v])=>({name,accuracy:Math.round(v.correct/v.total*100),total:v.total})).sort((a,b)=>a.accuracy-b.accuracy).slice(0,3);
  function move(id,to){setTopics(cur=>moveTopic(cur,id,to,subjectsList));setBattleStats(cur=>({...cur,attempts:(cur.attempts||[]).map(a=>a.topicId===id?{...a,subjectId:to}:a)}));setNotice("Topic moved. Subject counts and accuracy will update from saved attempts.");}
  function renameSubject(){const name=rename.trim();if(!name)return;const duplicate=matchSubject(name,subjectsList.filter(s=>s.id!==subject.id));if(duplicate){setNotice(`A subject named ${duplicate.name} already exists.`);return;}setSubjectsList(cur=>cur.map(s=>s.id===subject.id?{...s,name}:s));setTopics(cur=>cur.map(t=>t.subjectId===subject.id?{...t,subject:name}:t));setNotice("Subject renamed.");}
  function doMerge(){if(!mergeTo)return;try{const out=mergeSubjects(subjectsList,topics,subject.id,mergeTo);setSubjectsList(out.subjects);setTopics(out.topics);setBattleStats(cur=>({...cur,attempts:(cur.attempts||[]).map(a=>a.subjectId===subject.id?{...a,subjectId:mergeTo}:a)}));openSubject(mergeTo);}catch(e){setNotice(e.message);}}
  function doDelete(){if(!window.confirm(`Delete ${subject.name}? Any recorded attempts will be preserved under Unsorted.`))return;try{setSubjectsList(deleteSubject(subjectsList,topics,subject.id));setBattleStats(cur=>({...cur,attempts:(cur.attempts||[]).map(a=>a.subjectId===subject.id?{...a,subjectId:"unsorted"}:a),completedQuests:(cur.completedQuests||[]).map(q=>q.subjectId===subject.id?{...q,subjectId:"unsorted"}:q)}));setPage("subjects");}catch(e){setNotice(e.message);}}
  return <div className="content"><div className="page-heading"><div><div className="eyebrow">DUNGEON DETAIL</div><h1>{subject.name}</h1><p>{stats.topicCount} custom topics · {items.length} total quests · {stats.attempts} recorded answers</p></div><button className="primary" disabled={!items.length} onClick={()=>startQuest(lastActive)}><Swords size={16}/> Continue</button></div>
    <div className="stat-grid"><Stat icon={BookOpen} label="Topics & quests" value={items.length} sub="Linked to this subject"/><Stat icon={Target} label="Recorded accuracy" value={stats.accuracy==null?"Not assessed":`${stats.accuracy}%`} sub={`${stats.attempts} recorded answers`}/><Stat icon={Trophy} label="Quests cleared" value={stats.cleared} sub="Stored completions"/></div>
    {notice&&<p className="form-note" role="status">{notice}</p>}
    <div className="section-head"><div><div className="eyebrow">YOUR LEARNING PATHS</div><h2>Topics in this dungeon</h2></div></div>
    {!items.length?<div className="topic-empty"><BookOpen size={25}/><h3>This dungeon is empty</h3><p>Add a topic here to start building your knowledge map.</p><button className="primary" onClick={()=>{setNewName("");document.getElementById("subject-add-topic")?.focus();}}>Add a topic</button></div>:<div className="custom-topic-grid">{items.map((q,i)=>{const qa=attempts.filter(a=>a.topicId===q.id||normalizeSubjectName(a.topic)===normalizeSubjectName(q.title));const acc=qa.length?Math.round(qa.filter(a=>a.correct).length/qa.length*100):null;return <article className="custom-topic-card" key={q.id||q.title}><div className="custom-topic-top"><div className="topic-card-icon">{React.createElement(subjectIconMap[subject.icon]||BookOpen,{size:19})}</div><span className="difficulty">{q.difficulty||"Beginner"}</span></div><h3>{q.title}</h3><p className="custom-topic-subject">{q.builtIn?"Built-in quest":"Custom topic"} · {acc==null?"No assessment yet":`${acc}% accuracy`}</p><p className="custom-topic-goal">{q.pathSummary||q.goal||"Learn concepts and practise with adaptive questions."}</p><div className="custom-topic-progress"><div className="bar"><span style={{width:`${q.progress||0}%`}}/></div><small>{q.path?.length?`Stage ${(q.stageIndex||0)+1} of ${q.path.length}`:q.progress?`${q.progress}% progress`:"Ready to start"}</small></div><div className="topic-actions"><button className="topic-start-quest" onClick={()=>startQuest({...q,subject:subject.name,subjectId:subject.id})}><Swords size={14}/>{q.stageIndex||q.progress?"Continue":"Start quest"}</button>{q.customTopic&&<label className="move-topic-label">Move to<select value={q.subjectId} onChange={e=>move(q.id,e.target.value)} aria-label={`Move ${q.title} to another subject`}>{subjectsList.filter(s=>s.id!==subject.id).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label>}</div></article>})}</div>}
    <div className="topic-form subject-inline-form"><h2>Add topic to {subject.name}</h2><form onSubmit={e=>{e.preventDefault();const name=newName.trim();if(!name)return;const id=`${Date.now()}-${normalizeSubjectName(name).replace(/ /g,"-")}`;setTopics(cur=>[{id,name,title:name,subjectId:subject.id,subject:subject.name,level:"Beginner",goal:"Understand the basics and solve problems",stageIndex:0,stageProgress:{},createdAt:new Date().toISOString()},...cur]);setNewName("");setNotice("Topic added to this subject. Generate its learning path from My Topics.");}}><label>Topic name<input id="subject-add-topic" value={newName} onChange={e=>setNewName(e.target.value)} placeholder="e.g. JavaScript closures"/></label><button className="primary" type="submit"><Plus size={15}/> Add topic</button></form></div>
    {weak.length>0&&<section className="progress-panel"><div className="section-head"><div><div className="eyebrow">BASED ON YOUR ANSWERS</div><h2>Weakest concepts</h2></div></div>{weak.map(w=><div className="progress-topic" key={w.name}><div className="progress-topic-head"><div><b>{w.name}</b><p>{w.total} attempts</p></div><strong>{w.accuracy}%</strong></div><button className="text-btn" onClick={()=>startQuest({title:`Revision: ${w.name}`,subject:subject.name,subjectId:subject.id,xp:100,difficulty:"Easy",icon:Brain,goal:`Revise ${w.name} based on previous mistakes.`})}>Generate revision quest <ChevronRight size={14}/></button></div>)}</section>}
    <section className="settings-card subject-management"><h2>Manage subject</h2><div className="settings-row"><label>Rename<input value={rename} onChange={e=>setRename(e.target.value)}/></label><button className="secondary" onClick={renameSubject}>Save name</button></div><div className="settings-row"><label>Icon<select value={subject.icon} onChange={e=>setSubjectsList(cur=>cur.map(s=>s.id===subject.id?{...s,icon:e.target.value}:s))}>{Object.keys(subjectIconMap).map(i=><option key={i}>{i}</option>)}</select></label><label>Color<select value={subject.color} onChange={e=>setSubjectsList(cur=>cur.map(s=>s.id===subject.id?{...s,color:e.target.value}:s))}>{["violet","cyan","amber","pink","emerald","slate"].map(c=><option key={c}>{c}</option>)}</select></label></div><div className="settings-row"><label>Merge into<select value={mergeTo} onChange={e=>setMergeTo(e.target.value)}><option value="">Choose destination</option>{subjectsList.filter(s=>s.id!==subject.id).map(s=><option key={s.id} value={s.id}>{s.name}</option>)}</select></label><button className="secondary" disabled={!mergeTo} onClick={doMerge}>Merge subject</button><button className="secondary" onClick={doDelete}>Delete subject</button></div></section>
  </div>;
}

function Topics({ topics, setTopics, subjectsList=SEED_SUBJECTS, setSubjectsList=()=>{}, setBattleStats=()=>{}, startLearning, startQuest }) {
  const [topicName, setTopicName] = useState("");
  const [subject, setSubject] = useState("");
  const [classification, setClassification] = useState(null);
  const [overrideSubjectId, setOverrideSubjectId] = useState("");
  const [level, setLevel] = useState("Beginner");
  const [goal, setGoal] = useState("Understand the basics and solve problems");
  const [notes, setNotes] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");

  async function addTopic(event) {
    event.preventDefault();
    const name = topicName.trim();
    if (!name) { setError("Enter a topic name first."); return; }
    if (topics.some(t => t.name.toLowerCase() === name.toLowerCase())) {
      setError("This topic is already in your learning map."); return;
    }
    setIsCreating(true); setError(""); setClassification(null);
    try {
      let nextSubjects=subjectsList; let chosen=null;
      const typedMatch=matchSubject(subject,subjectsList);
      if(typedMatch) chosen=typedMatch;
      else {
        setClassification({status:"loading",label:"Placing topic…"});
        const result=await classifyOne({name,goal},subjectsList,subject.trim());
        nextSubjects=result.subjects; chosen=result.subject;
        if(!subject.trim()) { setSubjectsList(nextSubjects); setClassification({status:"done",subjectId:chosen?.id,label:`Added to ${chosen?.name||"Unsorted"}`}); }
        else { setClassification({status:"confirm",subjectId:chosen?.id,label:`Suggested: ${chosen?.name||"Unsorted"}`}); }
      }
      if(overrideSubjectId) chosen=nextSubjects.find(s=>s.id===overrideSubjectId)||chosen;
      if(!chosen) chosen=nextSubjects.find(s=>s.id==="unsorted");
      setSubjectsList(nextSubjects);
      let pathData={stages:[],summary:"Learning path generation can be retried from this topic."};
      try { const response=await fetch("/api/path/generate",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({topic:name,subject:chosen?.name||"Unsorted",level,goal,notes})}); const data=await response.json(); if(response.ok) pathData=data; else setError("Topic saved, but the AI learning path could not be generated. Retry it from the topic card."); }
      catch { setError("Topic saved, but the AI learning path could not be generated. Retry it from the topic card."); }
      const item={id:`${Date.now()}-${name}`,name,title:pathData.title||name,subjectId:chosen?.id||"unsorted",subject:chosen?.name||"Unsorted",level,goal,notes,path:pathData.stages||[],pathSummary:pathData.summary||"",stageIndex:0,stageProgress:{},createdAt:new Date().toISOString()};
      setTopics(current=>[item,...current]); setTopicName("");setSubject("");setNotes("");setOverrideSubjectId("");
      setClassification({status:"done",subjectId:item.subjectId,topicId:item.id,label:`Added to ${item.subject}`});
    } catch (err) { setError(`${err.message} The topic could not be saved. You can safely retry.`); }
    finally { setIsCreating(false); }
  }

  function removeTopic(id) {
    if(!window.confirm("Remove this topic and its recorded attempts?")) return;
    setTopics(current => current.filter(t => t.id !== id));
    setBattleStats(current => ({...current, attempts:(current.attempts||[]).filter(a=>a.topicId!==id)}));
  }

  return <div className="content">
    <div className="page-heading"><div><div className="eyebrow">PERSONALIZED LEARNING ENGINE</div><h1>My Topics</h1><p>Add any concept, syllabus unit, skill, or exam topic. Your AI Guide builds a learning path around it.</p></div></div>
    <div className="topic-layout">
      <form className="topic-form" onSubmit={addTopic}>
        <div className="topic-form-heading"><div className="topic-form-icon"><Plus size={19}/></div><div><h2>Add a custom topic</h2><p>Make the study plan yours.</p></div></div>
        <label>Topic or concept<input value={topicName} onChange={e => setTopicName(e.target.value)} placeholder="e.g. 8085 Interrupts, Python OOP, Fourier Transform" /></label>
        <label>Subject / course (optional)<input value={subject} onChange={e => {setSubject(e.target.value);setClassification(null);setOverrideSubjectId("");}} placeholder="Leave empty to auto-organize, or type a subject" /></label>
        {classification?.status === "loading" && <p className="classification-status" role="status">Placing in a suitable subject…</p>}
        {classification?.status === "done" && <div className="classification-chip" role="status">{classification.label} <button type="button" onClick={()=>setClassification({...classification,status:"confirm"})}>change</button></div>}
        {classification?.status === "confirm" && <div className="classification-confirm"><label>Confirm subject<select value={overrideSubjectId||classification.subjectId||"unsorted"} onChange={e=>{if(e.target.value==="__create__"){const name=window.prompt("New subject name");if(name?.trim()){const found=matchSubject(name,subjectsList);if(found){setOverrideSubjectId(found.id);}else{const created={id:normalizeSubjectName(name).replace(/ /g,"-"),name:name.trim(),icon:"BookOpen",color:"violet",createdBy:"user",aliases:[]};setSubjectsList(cur=>[...cur,created]);setOverrideSubjectId(created.id);}}}else setOverrideSubjectId(e.target.value);}}>{subjectsList.map(s=><option key={s.id} value={s.id}>{s.name}</option>)}<option value="__create__">Create new subject…</option></select></label><button type="button" className="secondary" onClick={()=>{const target=subjectsList.find(s=>s.id===(overrideSubjectId||classification.subjectId));if(target&&classification.topicId){setTopics(cur=>cur.map(t=>t.id===classification.topicId?{...t,subjectId:target.id,subject:target.name}:t));setClassification({status:"done",topicId:classification.topicId,subjectId:target.id,label:`Added to ${target.name}`});setOverrideSubjectId("");}}}>Apply subject</button></div>}
        <label>Starting level<select value={level} onChange={e => setLevel(e.target.value)}><option>Beginner</option><option>Some basics</option><option>Intermediate</option><option>Exam revision</option></select></label>
        <label>Learning goal<input value={goal} onChange={e => setGoal(e.target.value)} placeholder="What do you want to be able to do?" /></label>
        <label>Optional class notes / syllabus<textarea value={notes} onChange={e => setNotes(e.target.value)} rows={3} placeholder="Paste a short syllabus extract or notes to ground your learning path." /></label>
        {error && <p className="form-error">{error}</p>}
        <button className="primary topic-submit" type="submit" disabled={isCreating}><Plus size={16}/> {isCreating ? "Generating your learning path..." : "Create topic & learning path"}</button>
        <p className="form-note">Topics are saved in this browser. Your API key stays on the backend in your .env file.</p>
      </form>
      <div className="topic-info-card"><div className="eyebrow"><BrainCircuit size={14}/> HOW ADAPTIVE LEARNING WORKS</div><h2>Mastery is demonstrated, not guessed.</h2><div className="adaptive-step"><span>01</span><div><b>Diagnose</b><p>Start with prerequisites and a few questions that reveal your current understanding.</p></div></div><div className="adaptive-step"><span>02</span><div><b>Explain your reasoning</b><p>The tutor checks how you reached an answer, not only whether it is correct.</p></div></div><div className="adaptive-step"><span>03</span><div><b>Target the gaps</b><p>Practice misconceptions with worked examples, focused tasks, and a follow-up check.</p></div></div><div className="adaptive-step"><span>04</span><div><b>Recheck mastery</b><p>Increase difficulty only when your answers provide evidence of understanding.</p></div></div></div>
    </div>
    <div className="section-head topic-list-head"><div><div className="eyebrow">YOUR PERSONAL SYLLABUS</div><h2>Custom learning topics</h2></div><span className="topic-count">{topics.length} saved</span></div>
    {topics.length === 0 ? <div className="topic-empty"><BookOpen size={25}/><h3>Your learning map is waiting</h3><p>Add your first custom topic above. You can then generate a beginner path, diagnostic quiz, practical quest, or mastery check.</p></div> : <div className="custom-topic-grid">{topics.map(topic => <article className="custom-topic-card" key={topic.id}><div className="custom-topic-top"><div className="topic-card-icon"><GraduationCap size={19}/></div><button className="topic-remove" type="button" onClick={() => removeTopic(topic.id)} aria-label={`Remove ${topic.name}`}>×</button></div><h3>{topic.name}</h3><p className="custom-topic-subject">{subjectsList.find(s=>s.id===topic.subjectId)?.name || topic.subject || "Unsorted"} · {topic.level}</p><p className="custom-topic-goal">{topic.goal}</p><div className="custom-topic-progress"><div className="bar"><span style={{width:`${Math.round((topic.stageIndex||0)/(topic.path?.length||5)*100)}%`}}/></div><small>{topic.path?.length ? `Stage ${(topic.stageIndex||0)+1} of ${topic.path.length} · ${topic.stageProgress ? Object.values(topic.stageProgress).filter(x=>x.cleared).length : 0} cleared` : "Learning path not generated yet"}</small></div><div className="topic-actions"><button className="topic-start-quest" onClick={() => startQuest({ ...topic, title: topic.name, xp: 120, difficulty: topic.level === "Beginner" ? "Easy" : topic.level === "Intermediate" ? "Medium" : "Hard", icon: GraduationCap, progress: topic.stageIndex ? Math.round(topic.stageIndex / (topic.path?.length || 5) * 100) : 0, customTopic: true })}><Swords size={14}/> Enter dungeon</button><button onClick={() => startQuest({ ...topic, title:topic.name, customTopic:true }, "basics")}><BookOpen size={14}/> Learn basics</button><button onClick={() => startQuest({ ...topic, title:topic.name, customTopic:true }, "quiz")}><ClipboardCheck size={14}/> Diagnostic quiz</button><button onClick={() => startQuest({ ...topic, title:topic.name, customTopic:true }, "task")}><Swords size={14}/> Task quest</button><button onClick={() => startQuest({ ...topic, title:topic.name, customTopic:true }, "mastery")}><Target size={14}/> Mastery check</button></div></article>)}</div>}
  </div>;
}

function Achievements({ xp = 0, stats = { attempts: [], completedQuests: [] } }) {
  const attempts = stats.attempts || [];
  const accuracy = attempts.length ? attempts.filter(a=>a.correct).length / attempts.length : 0;
  const hardCorrect = attempts.filter(a=>a.correct && a.difficulty==="hard").length;
  const items = [
    ["First Blood", "Complete your first stage gate", (stats.completedQuests||[]).length >= 1, Swords, (stats.completedQuests||[]).length, 1],
    ["Seven Flames", "Maintain a 7-day streak", false, Flame, 0, 7],
    ["Scholar", "Reach 2,000 XP", xp >= 2000, BookOpen, xp, 2000],
    ["Boss Slayer", "Answer 10 hard questions correctly", hardCorrect >= 10, Shield, hardCorrect, 10],
    ["Mastermind", "Reach 90% accuracy with at least 20 answers", attempts.length >= 20 && accuracy >= .9, Brain, Math.min(attempts.length,20), 20],
    ["Dungeon Legend", "Reach Level 20", Math.floor(xp/500)+1 >= 20, Trophy, Math.floor(xp/500)+1, 20]
  ];

  return (
    <div className="content">
      <div className="page-heading">
        <div>
          <div className="eyebrow">TROPHY HALL</div>
          <h1>Achievements</h1>
          <p>Every milestone becomes part of your legend.</p>
        </div>
      </div>

      <div className="achievement-grid">
        {items.map(([title, description, done, Icon, progress = 0, target = 1]) => (
          <div className={`achievement ${done ? "done" : ""}`} key={title}>
            <div className="achievement-icon"><Icon size={24} /></div>
            <div>
              <b>{title}</b>
              <p>{description}</p>
              {!done && <div className="achievement-progress"><span style={{width:`${Math.min(100,Math.round((progress/target)*100))}%`}}/><small>{Math.min(progress,target)} / {target}</small></div>}
            </div>
            {done
              ? <CheckCircle2 className="check" size={18} />
              : <span className="locked">LOCKED</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { hasError: false }; }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error) { console.error("AI Study Dungeon render error:", error); }
  render() {
    if (this.state.hasError) return <main className="content"><div className="topic-empty"><Shield size={28}/><h1>The dungeon needs a moment</h1><p>An unexpected interface error occurred. Your saved progress should remain in this browser.</p><button className="primary" onClick={() => window.location.reload()}>Reload app</button></div></main>;
    return this.props.children;
  }
}

createRoot(document.getElementById("root")).render(<ErrorBoundary><App /></ErrorBoundary>);
