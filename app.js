/* Vocabulary Master — a small, dependency-free GitHub Pages learning app.
 * All private learning data lives only in this browser.
 * data/vocabulary.json contains shared starter words, never learner progress.
 */
(function () {
  'use strict';

  const STORAGE_KEY = 'vocabmaster.data.v1';
  const NAV_LABELS = {home:'Dashboard',words:'My word lists',flashcards:'Flashcards',practice:'Quick practice',test:'Test mode',progress:'My progress'};
  const POS = ['Noun','Verb','Adjective','Adverb','Noun/Verb','Pronoun','Other'];
  const REVIEW_DAYS = [0,1,3,7,14,30];
  const byId = (id) => document.getElementById(id);
  const h = (value) => String(value == null ? '' : value).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  const normalize = (value) => String(value || '').trim().replace(/\s+/g,' ').toLocaleLowerCase();
  const keyFor = (word) => normalize(word.word) + '::' + normalize(word.deck);
  const randomId = () => 'word-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,9);
  const newDb = () => ({version:1,words:[],progress:{},history:[],deletedSeedIds:[],editedSeedIds:[]});
  let db = newDb();
  let seedWords = [];
  let view = 'home';
  let selectedDeck = 'all';
  let searchText = '';
  let flash = null;
  let quiz = null;
  let importPreview = [];
  let toastTimeout = null;

  function loadStored() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const data = JSON.parse(raw);
      if (!data || !Array.isArray(data.words) || !data.progress || typeof data.progress !== 'object') return null;
      return sanitizeDb(data);
    } catch (error) {
      console.warn('Could not read saved vocabulary:', error);
      return null;
    }
  }
  function sanitizeDb(value) {
    const result = newDb();
    result.words = (value.words || []).filter((w) => w && typeof w.word === 'string' && typeof w.definition === 'string' && w.word.trim() && w.definition.trim()).slice(0,10000).map((w) => ({
      id:String(w.id || randomId()),word:String(w.word).slice(0,160),
      partOfSpeech:String(w.partOfSpeech || 'Other').slice(0,64),
      definition:String(w.definition).slice(0,1000),
      sentence:String(w.sentence || '').slice(0,1200),
      deck:String(w.deck || 'My Words').slice(0,120)
    }));
    result.progress = value.progress && typeof value.progress === 'object' && !Array.isArray(value.progress) ? value.progress : {};
    result.history = Array.isArray(value.history) ? value.history.slice(0,150) : [];
    result.deletedSeedIds = Array.isArray(value.deletedSeedIds) ? value.deletedSeedIds.map(String) : [];
    result.editedSeedIds = Array.isArray(value.editedSeedIds) ? value.editedSeedIds.map(String) : [];
    return result;
  }
  function mergeSeedWords() {
    const deleted = new Set(db.deletedSeedIds);
    const edited = new Set(db.editedSeedIds);
    for (const entry of seedWords) {
      if (!entry || !entry.id || !entry.word || !entry.definition || deleted.has(entry.id)) continue;
      const index = db.words.findIndex((w) => w.id === entry.id);
      if (index >= 0) {
        if (!edited.has(entry.id)) db.words[index] = {...entry};
      } else if (!db.words.some((w) => keyFor(w) === keyFor(entry))) {
        db.words.push({...entry});
      }
    }
  }
  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    } catch (error) {
      console.warn('Could not save vocabulary:', error);
      toast('Browser storage is unavailable or full. Download a backup to avoid losing your work.');
    }
  }
  function toast(message) {
    const el = byId('toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => el.classList.remove('show'), 4200);
  }
  function allDecks() {
    return [...new Set(db.words.map((w) => w.deck).filter(Boolean))].sort((a,b) => a.localeCompare(b));
  }
  function scopedWords() {
    return selectedDeck === 'all' ? db.words : db.words.filter((w) => w.deck === selectedDeck);
  }
  function progressOf(word) {
    const p = db.progress[word.id] || {};
    return {correct:Math.max(0,Number(p.correct) || 0),wrong:Math.max(0,Number(p.wrong) || 0),level:Math.max(0,Math.min(5,Number(p.level) || 0)),nextDue:p.nextDue || null,lastStudied:p.lastStudied || null};
  }
  function wordStatus(word) {
    const p = progressOf(word);
    if (p.level >= 3) return 'mastered';
    if (p.correct + p.wrong > 0) return 'learning';
    return 'new';
  }
  function due(word) {
    const p = progressOf(word);
    return !p.nextDue || new Date(p.nextDue).getTime() <= Date.now();
  }
  function recordAnswer(word, correct) {
    const p = progressOf(word);
    p[correct ? 'correct' : 'wrong'] += 1;
    p.level = correct ? Math.min(5,p.level+1) : Math.max(0,p.level-1);
    p.lastStudied = new Date().toISOString();
    const afterDays = correct ? REVIEW_DAYS[p.level] : 0;
    p.nextDue = new Date(Date.now() + afterDays * 86400000).toISOString();
    db.progress[word.id] = p;
    save();
  }
  function counts(words = scopedWords()) {
    return {total:words.length,new:words.filter((w) => wordStatus(w) === 'new').length,
      learning:words.filter((w) => wordStatus(w) === 'learning').length,
      mastered:words.filter((w) => wordStatus(w) === 'mastered').length,
      due:words.filter(due).length};
  }
  function shuffle(input) {
    const result = input.slice();
    for (let i=result.length-1;i>0;i--) {
      const j = Math.floor(Math.random()*(i+1));
      [result[i],result[j]] = [result[j],result[i]];
    }
    return result;
  }
  function pct(n,d) {return d ? Math.round(n/d*100) : 0;}
  function dateLabel(iso) {
    if (!iso || Number.isNaN(new Date(iso).getTime())) return 'Not yet';
    return new Date(iso).toLocaleDateString(undefined,{month:'short',day:'numeric'});
  }
  function section(title,lead) {
    return '<div class="section-top"><div><h1 class="hi">' + h(title) + '</h1><p class="subtitle">' + h(lead) + '</p></div></div>';
  }
  function statusPill(word) {
    const status = wordStatus(word);
    return '<span class="pill '+status+'">'+(status === 'new' ? 'Not started' : status === 'learning' ? 'Learning' : 'Mastered')+'</span>';
  }
  function render() {
    const app = byId('app');
    if (!app) return;
    if (!NAV_LABELS[view]) view = 'home';
    byId('breadcrumb').textContent = 'MY LEARNING SPACE / ' + NAV_LABELS[view].toUpperCase();
    document.querySelectorAll('[data-view]').forEach((el) => {
      const active = el.dataset.view === view;
      el.classList.toggle('active', active);
      if (active) el.setAttribute('aria-current','page'); else el.removeAttribute('aria-current');
    });
    const select = byId('deckFilter');
    if (selectedDeck !== 'all' && !allDecks().includes(selectedDeck)) selectedDeck = 'all';
    select.innerHTML = '<option value="all">All word lists</option>' + allDecks().map((d) => '<option value="'+h(d)+'">'+h(d)+'</option>').join('');
    select.value = selectedDeck;
    app.innerHTML = ({
      home:renderHome, words:renderWords, flashcards:renderFlashcards,
      practice:() => renderQuizPage('practice'),test:() => renderQuizPage('test'),
      progress:renderProgress
    })[view]();
    if (view === 'words') drawWordsTable();
  }
  function navigate(destination) {
    if (!NAV_LABELS[destination]) destination = 'home';
    view = destination;
    window.location.hash = destination;
    render();
    window.scrollTo({top:0,behavior:'instant'});
  }
  function renderHome() {
    const w = scopedWords(), c = counts(w);
    const firstWords = w.filter(due).slice(0,4);
    return section('Good to see you! 👋','Ready to discover something new today?') +
      '<div class="hero"><div class="hero-text"><div class="hero-tag">✦ YOUR WORD JOURNEY</div>'+
      '<h2>A little practice goes a long way.</h2><p>Every new word is a new way to express yourself. Pick up where you left off!</p>'+
      '<button class="button light" data-view="practice">Start practicing &nbsp; →</button></div><div class="hero-art" aria-hidden="true">📖</div></div>'+
      '<div class="stat-grid">'+
      stat('Total words',c.total,'▤','purple','in your collection')+
      stat('Mastered',c.mastered,'★','green','you know these well')+
      stat('Still learning',c.learning,'✎','orange','keep them going')+
      stat('Ready to review',c.due,'◷','blue','new or due today')+'</div>'+
      '<div class="section-row"><h2 class="section-title">What would you like to do?</h2></div>'+
      '<div class="learning-grid">'+tile('▣','Flashcards','Flip, learn, and remember.','flashcards','purple')+
      tile('✦','Quick practice','Choose the right meaning or spell it.','practice','orange')+
      tile('✎','Take a test','See how many words you really know.','test','blue')+'</div>'+
      '<div class="bottom-grid"><div class="panel"><div class="panel-head"><span class="panel-title">Words to review</span><button class="text-link" data-view="words">See all →</button></div>'+
      (firstWords.length ? '<div class="mini-list">'+firstWords.map((item) => '<div class="mini-word"><span class="mini-letter">'+h(item.word.charAt(0).toUpperCase())+'</span><div><strong>'+h(item.word)+'</strong><small>'+h(item.definition.slice(0,64))+'</small></div>'+statusPill(item)+'</div>').join('')+'</div>' :
      '<div class="empty">You are all caught up! 🌟</div>')+'</div>'+
      '<div class="panel"><div class="panel-head"><span class="panel-title">Your collections</span><button class="text-link" data-view="words">Manage →</button></div>'+
      (allDecks().length ? '<div class="mini-list">'+allDecks().slice(0,5).map((d) => '<div class="mini-word"><span class="mini-letter">📚</span><div><strong>'+h(d)+'</strong><small>'+db.words.filter((w) => w.deck===d).length+' words</small></div></div>').join('')+'</div>' :
      '<div class="empty">Add a vocabulary list to get started.</div>')+
      '</div></div>';
  }
  function stat(name,value,icon,color,desc) {
    return '<div class="stat-card"><div class="stat-top"><span>'+h(name)+'</span><span class="stat-icon '+color+'">'+icon+'</span></div><div class="stat-value">'+value+'</div><div class="stat-foot">'+h(desc)+'</div></div>';
  }
  function tile(icon,title,desc,destination,color) {
    return '<button class="learning-tile" data-view="'+destination+'"><span class="tile-icon '+color+'">'+icon+'</span><strong>'+h(title)+'</strong><p>'+h(desc)+'</p></button>';
  }
  function deckChips() {
    return '<div class="deck-chips"><button class="chip '+(selectedDeck==='all'?'active':'')+'" data-deck="all">All lists ('+db.words.length+')</button>'+
      allDecks().map((d) => '<button class="chip '+(selectedDeck===d?'active':'')+'" data-deck="'+h(d)+'">'+h(d)+' ('+db.words.filter((w) => w.deck===d).length+')</button>').join('')+'</div>';
  }
  function renderWords() {
    return '<div class="section-top"><div><h1 class="hi">My word lists</h1><p class="subtitle">Everything you are learning, all in one place.</p></div>'+
      '<div class="toolbar" style="margin:0"><button class="button outline" data-action="open-import">↑ Import words</button>'+
      '<button class="button primary" data-action="open-add">＋ Add a word</button></div></div>'+
      deckChips()+'<div class="toolbar"><input id="wordSearch" class="search" type="search" placeholder="⌕  Search words or meanings…" value="'+h(searchText)+'" aria-label="Search words and definitions"/>'+
      '<button class="button outline" data-action="open-backup">☁ Backup / restore</button></div><div id="wordResults"></div>';
  }
  function drawWordsTable() {
    const root = byId('wordResults');
    if (!root) return;
    const query = normalize(searchText);
    const words = scopedWords().filter((w) => !query || [w.word,w.definition,w.sentence,w.partOfSpeech].some((v) => normalize(v).includes(query))).slice().sort((a,b) => a.word.localeCompare(b.word));
    if (!words.length) {
      root.innerHTML = '<div class="panel empty"><div class="empty-icon">📚</div><strong>'+ (query ? 'No matching words' : 'No words yet')+'</strong><p>'+(query ? 'Try a different search.' : 'Add your first word or import a school vocabulary list.')+'</p>'+
      '<button class="button primary" data-action="open-add">＋ Add a word</button></div>';
      return;
    }
    root.innerHTML = '<div class="table-scroll"><table class="word-table"><thead><tr><th>Word</th><th>Part of speech</th><th>Definition / example</th><th>Progress</th><th>Actions</th></tr></thead><tbody>'+
      words.map((w) => '<tr><td><strong>'+h(w.word)+'</strong><div class="sentence">'+h(w.deck)+'</div></td><td>'+h(w.partOfSpeech)+'</td>'+
      '<td class="definition">'+h(w.definition)+(w.sentence ? '<div class="sentence">'+h(w.sentence)+'</div>':'')+'</td><td>'+statusPill(w)+'</td>'+
      '<td><div class="actions"><button class="icon-btn" data-action="edit-word" data-id="'+h(w.id)+'" aria-label="Edit '+h(w.word)+'">Edit</button>'+
      '<button class="icon-btn" data-action="delete-word" data-id="'+h(w.id)+'" aria-label="Delete '+h(w.word)+'">×</button></div></td></tr>').join('')+'</tbody></table></div>'+
      '<p class="helper">'+words.length+' word'+(words.length===1?'':'s')+' shown. Every change saves automatically on this device.</p>';
  }
  function renderFlashcards() {
    const words = scopedWords();
    if (!words.length) return section('Flashcards','Flip a card, learn the meaning, and keep going.') + emptyStudy();
    if (!flash || flash.deck !== selectedDeck) return section('Flashcards','Learn at your own pace, one word at a time.')+
      '<div class="panel study-shell" style="text-align:center;padding:43px 25px"><div style="font-size:60px">🃏</div><h2 class="section-title" style="margin-top:15px">Let’s flip some cards!</h2><p class="subtitle">Look at the word, recall its meaning, then reveal the answer.</p>'+
      '<div class="session-actions"><button class="button primary" data-action="start-flash" data-scope="all">Study all '+words.length+' words</button>'+
      '<button class="button outline" data-action="start-flash" data-scope="due">Review due words ('+words.filter(due).length+')</button></div></div>';
    if (flash.index >= flash.cards.length) return '<div class="study-shell">'+section('Flashcards complete!','Great job showing up for your words.')+
      '<div class="result-card"><div class="result-emoji">🎉</div><h2>Nicely done!</h2><p>You reviewed '+flash.cards.length+' words and remembered '+flash.correct+'.</p>'+
      '<div class="session-actions"><button class="button primary" data-action="start-flash" data-scope="all">Study again</button><button class="button outline" data-view="progress">View progress</button></div></div></div>';
    const w = flash.cards[flash.index];
    return '<div class="study-shell">'+section('Flashcards','Tap the card to reveal its meaning.')+
      '<div class="session-meta"><span>Card '+(flash.index+1)+' of '+flash.cards.length+'</span><span>'+flash.correct+' remembered</span></div>'+
      '<div class="progress-line"><div style="width:'+pct(flash.index,flash.cards.length)+'%"></div></div>'+
      '<button class="flashcard" data-action="flash-flip" aria-label="Flip flashcard">'+
      (flash.revealed ? '<span class="flash-label">THE MEANING</span><h2>'+h(w.definition)+'</h2><p>'+h(w.word)+' · '+h(w.partOfSpeech)+'</p>'+
      (w.sentence?'<div class="sentence-hint">“'+h(w.sentence)+'”</div>':'')+'<small>Tap to see the word again</small>' :
      '<span class="flash-label">WHAT DOES THIS MEAN?</span><h2>'+h(w.word)+'</h2><p>'+h(w.partOfSpeech)+'</p><small>✦ Tap to reveal the meaning ✦</small>')+'</button>'+
      '<div class="session-actions">'+(flash.revealed ?
      '<button class="button outline" data-action="flash-rate" data-correct="false">↺ Still learning</button><button class="button primary" data-action="flash-rate" data-correct="true">✓ I remembered!</button>' :
      '<button class="button primary" data-action="flash-flip">Reveal meaning</button>')+'</div>'+
      '<p style="text-align:center"><button class="text-link" data-action="stop-flash">← Back to flashcards</button></p></div>';
  }
  function emptyStudy() {
    return '<div class="panel empty"><div class="empty-icon">🪄</div><strong>Let’s add some words first</strong><p>You need at least one vocabulary word to begin.</p><button class="button primary" data-view="words">Go to my words</button></div>';
  }
  function startFlash(dueOnly) {
    let cards = scopedWords().filter((w) => !dueOnly || due(w));
    if (!cards.length) {toast('No words are due right now. Try studying all words!');return;}
    flash = {deck:selectedDeck,cards:shuffle(cards),index:0,correct:0,revealed:false};
    render();
  }
  function rateFlash(correct) {
    if (!flash || !flash.revealed || flash.index >= flash.cards.length) return;
    recordAnswer(flash.cards[flash.index],correct);
    if (correct) flash.correct++;
    flash.index++;
    flash.revealed = false;
    render();
  }
  function makeQuestion(word,kind,pool) {
    if (kind === 'spelling') return {word,kind,choices:[]};
    let distractors = shuffle(pool.filter((w) => w.id !== word.id && (kind === 'meaning' ? normalize(w.definition) !== normalize(word.definition) : normalize(w.word) !== normalize(word.word))));
    const used = new Set([normalize(kind === 'meaning' ? word.definition : word.word)]);
    distractors = distractors.filter((w) => {
      const value = normalize(kind === 'meaning' ? w.definition : w.word);
      if (used.has(value)) return false;
      used.add(value);
      return true;
    }).slice(0,3);
    if (!distractors.length) return {word,kind:'spelling',choices:[]};
    return {word,kind,choices:shuffle([word,...distractors])};
  }
  function startQuiz(mode,kind) {
    const pool = scopedWords();
    if (!pool.length) {navigate('words');return;}
    let cards = shuffle(pool).slice(0, Math.min(mode === 'test'?10:10,pool.length));
    quiz = {mode,deck:selectedDeck,questions:cards.map((w,i) => makeQuestion(w, mode === 'test' ? ['meaning','word','spelling'][i%3] : kind, pool)),
      index:0,score:0,answered:false,picked:null,wasCorrect:false,guess:'',answers:[],finished:false};
    render();
  }
  function renderQuizPage(mode) {
    if (!scopedWords().length) return section(mode==='test'?'Test mode':'Quick practice','Your word journey starts here.') + emptyStudy();
    if (!quiz || quiz.mode !== mode || quiz.deck !== selectedDeck) {
      const heading = mode === 'test' ? 'Ready for a little challenge?' : 'How do you want to practice?';
      const intro = mode === 'test' ? 'A mix of meanings, word recognition, and spelling. Answers are revealed at the end.' : 'Choose your favorite way to learn. Mistakes help us pick what to review next.';
      return section(mode === 'test' ? 'Test mode' : 'Quick practice',intro)+
        '<div class="panel study-shell" style="text-align:center;padding:42px 25px"><div style="font-size:57px">'+(mode==='test'?'📝':'🧠')+'</div>'+
        '<h2 class="section-title" style="margin:13px 0 7px">'+heading+'</h2><p class="subtitle">Up to 10 questions from your selected list.</p>'+
        (mode === 'test' ? '<button class="button primary" data-action="start-quiz" data-mode="test" data-kind="mixed">Start my test →</button>' :
        '<div class="session-actions"><button class="button primary" data-action="start-quiz" data-mode="practice" data-kind="meaning">Word → Meaning</button>'+
        '<button class="button soft" data-action="start-quiz" data-mode="practice" data-kind="word">Meaning → Word</button>'+
        '<button class="button outline" data-action="start-quiz" data-mode="practice" data-kind="spelling">Spelling practice</button></div>')+
        '</div>';
    }
    if (quiz.finished) return renderQuizResult();
    const q = quiz.questions[quiz.index], no = quiz.index+1, total = quiz.questions.length;
    let body;
    if (q.kind === 'spelling') {
      body = '<form id="spellForm"><label class="helper" for="spellAnswer">Type the vocabulary word that matches this definition:</label>'+
      '<input type="text" id="spellAnswer" class="spell-input" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="Type the word…" '+(quiz.answered?'disabled':'')+' value="'+h(quiz.guess)+'" />'+
      (!quiz.answered?'<button type="submit" class="button primary">Check answer</button>':'')+'</form>';
    } else {
      body = '<div class="choice-grid">'+q.choices.map((candidate,i) => {
        const chosen = quiz.answered && quiz.picked === candidate.id;
        const showAnswer = quiz.answered && mode === 'practice';
        const style = showAnswer && candidate.id === q.word.id ? 'correct' : showAnswer && chosen ? 'wrong' : chosen ? 'chosen' : '';
        const label = q.kind === 'meaning' ? candidate.definition : candidate.word;
        return '<button class="choice '+style+'" data-action="pick-answer" data-id="'+h(candidate.id)+'" '+(quiz.answered?'disabled':'')+'><span class="choice-letter">'+String.fromCharCode(65+i)+'</span><span>'+h(label)+'</span></button>';
      }).join('')+'</div>';
    }
    let feedback = '';
    if (quiz.answered) {
      if (mode === 'practice') {
        feedback = '<div class="quiz-feedback '+(quiz.wasCorrect?'good':'bad')+'"><strong>'+(quiz.wasCorrect?'That’s right! ✨':'Good try — keep learning!')+'</strong><br>'+
          'The answer is <strong>'+h(q.word.word)+'</strong>: '+h(q.word.definition)+
          (q.word.sentence ? '<br><em>'+h(q.word.sentence)+'</em>':'')+'</div>';
      } else {
        feedback = '<div class="quiz-feedback">Answer saved. Keep going — you’ll see your score at the end.</div>';
      }
      feedback += '<div class="session-actions"><button class="button primary" data-action="quiz-next">'+(no===total?'See results →':'Next question →')+'</button></div>';
    }
    return '<div class="study-shell">'+section(mode==='test'?'Test mode':'Quick practice',mode==='test'?'Do your best — no peeking!':'Every answer helps you learn.')+
      '<div class="session-meta"><span>Question '+no+' of '+total+'</span><span>'+(mode==='test'?'Your mini vocabulary test':quiz.score+' correct so far')+'</span></div>'+
      '<div class="progress-line" style="margin-bottom:18px"><div style="width:'+pct(quiz.index,total)+'%"></div></div>'+
      '<div class="question-box"><div class="question-kicker">'+(q.kind==='meaning'?'CHOOSE THE DEFINITION':q.kind==='word'?'FIND THE WORD':'SPELL THE WORD')+'</div>'+
      '<h2>'+(q.kind==='meaning'?'What does “'+h(q.word.word)+'” mean?' : q.kind==='word'?'Which word means “'+h(q.word.definition)+'”?' : 'Which word means “'+h(q.word.definition)+'”?')+'</h2>'+
      body+feedback+'</div><p style="text-align:center"><button class="text-link" data-action="stop-quiz">← Exit '+(mode==='test'?'test':'practice')+'</button></p></div>';
  }
  function answerQuiz(chosen) {
    if (!quiz || quiz.finished || quiz.answered) return;
    const q = quiz.questions[quiz.index];
    const correct = q.kind==='spelling' ? normalize(chosen) === normalize(q.word.word) : String(chosen) === String(q.word.id);
    quiz.answered = true;
    quiz.wasCorrect = correct;
    quiz.picked = q.kind==='spelling' ? null : chosen;
    quiz.guess = q.kind==='spelling' ? String(chosen).trim() : '';
    if (correct) quiz.score++;
    quiz.answers.push({word:q.word.word,definition:q.word.definition,correct,answer:quiz.guess || chosen});
    recordAnswer(q.word,correct);
    render();
  }
  function advanceQuiz() {
    if (!quiz || !quiz.answered) return;
    quiz.index++;
    quiz.answered = false;
    quiz.picked = null;
    quiz.guess = '';
    if (quiz.index >= quiz.questions.length) {
      quiz.finished = true;
      db.history.unshift({date:new Date().toISOString(),mode:quiz.mode,deck:quiz.deck,score:quiz.score,total:quiz.questions.length});
      db.history = db.history.slice(0,150);
      save();
    }
    render();
  }
  function renderQuizResult() {
    const missed = quiz.answers.filter((a) => !a.correct);
    const score = pct(quiz.score,quiz.questions.length);
    return '<div class="study-shell">'+section('Your results','Every attempt makes your vocabulary stronger.')+
      '<div class="result-card"><div class="result-emoji">'+(score>=80?'🏆':score>=50?'🌟':'🌱')+'</div><h2>'+(score>=80?'Wonderful work!':score>=50?'Keep it up!':'You’re learning!')+'</h2>'+
      '<div class="result-score">'+quiz.score+' / '+quiz.questions.length+'</div><p>'+score+'% correct · '+(quiz.mode==='test'?'Test':'Practice')+' completed</p>'+
      (missed.length ? '<div style="text-align:left;margin-top:24px"><h3 class="panel-title">Words to revisit</h3><div class="mini-list">'+missed.map((a) => '<div class="mini-word"><span class="mini-letter">'+h(a.word.charAt(0).toUpperCase())+'</span><div><strong>'+h(a.word)+'</strong><small>'+h(a.definition)+'</small></div></div>').join('')+'</div></div>' :
      '<p>Perfect! You remembered every word in this round.</p>')+
      '<div class="session-actions"><button class="button primary" data-action="restart-quiz">Practice again</button>'+
      '<button class="button outline" data-view="progress">My progress</button></div></div></div>';
  }
  function renderProgress() {
    const words = scopedWords(), c = counts(words);
    const practiced = words.map((w) => ({word:w,p:progressOf(w)})).filter((x) => x.p.correct+x.p.wrong>0).sort((a,b) => b.p.wrong-a.p.wrong);
    const relevant = db.history.filter((x) => selectedDeck === 'all' || x.deck === selectedDeck);
    const answered = practiced.reduce((n,x) => n+x.p.correct+x.p.wrong,0);
    return section('My progress','See how far you have come — every word counts.')+
      '<div class="stat-grid">'+stat('Words in collection',c.total,'▤','purple','in this view')+
      stat('Mastered',c.mastered,'★','green','level 3 or higher')+
      stat('Answers given',answered,'✦','blue','across all practice')+
      stat('Ready to review',c.due,'◷','orange','new or due today')+'</div>'+
      '<div class="bottom-grid"><div class="panel"><div class="panel-title">Learning breakdown</div>'+
      '<div class="bars"><span class="mastered-bar" style="width:'+pct(c.mastered,c.total)+'%"></span><span class="learning-bar" style="width:'+pct(c.learning,c.total)+'%"></span><span class="new-bar" style="width:'+pct(c.new,c.total)+'%"></span></div>'+
      '<div class="legend"><span><b style="background:#65c39b"></b>Mastered '+c.mastered+'</span><span><b style="background:#ebc06a"></b>Learning '+c.learning+'</span><span><b style="background:#b6a4ef"></b>Not started '+c.new+'</span></div>'+
      '<p class="helper" style="margin-top:18px">A word is mastered at review level 3. A wrong answer lowers its level so it gets extra practice.</p></div>'+
      '<div class="panel"><div class="panel-head"><span class="panel-title">Recent sessions</span></div>'+
      (relevant.length ? '<div class="mini-list">'+relevant.slice(0,5).map((x) => '<div class="mini-word"><span class="mini-letter">'+(x.mode==='test'?'✎':'✦')+'</span><div><strong>'+h(x.mode==='test'?'Vocabulary test':'Practice')+' · '+h(x.deck==='all'?'All lists':x.deck)+'</strong><small>'+dateLabel(x.date)+'</small></div><span class="pill learning">'+Number(x.score)+'/'+Number(x.total)+'</span></div>').join('')+'</div>' :
      '<div class="empty"><strong>No sessions yet</strong><p>Take a quiz and your scores will show up here.</p></div>')+'</div></div>'+
      '<div class="section-row"><h2 class="section-title">Word-by-word progress</h2><button class="button outline" data-action="open-backup">☁ Backup / restore</button></div>'+
      (practiced.length ? '<div class="table-scroll"><table class="word-table"><thead><tr><th>Word</th><th>Correct</th><th>Missed</th><th>Review level</th><th>Next review</th></tr></thead><tbody>'+
        practiced.map((x) => '<tr><td><strong>'+h(x.word.word)+'</strong></td><td>'+x.p.correct+'</td><td>'+x.p.wrong+'</td><td>'+x.p.level+' / 5</td><td>'+(!due(x.word)?dateLabel(x.p.nextDue):'Ready now')+'</td></tr>').join('')+'</tbody></table></div>' :
        '<div class="panel empty"><div class="empty-icon">🌱</div><strong>Your learning journey starts here</strong><p>Try a few flashcards or a quiz to see progress.</p><button class="button primary" data-view="practice">Start practice</button></div>');
  }

  function modal(title,description,body,actions) {
    closeModal();
    document.body.insertAdjacentHTML('beforeend',
      '<div class="modal-backdrop" id="modalBackdrop"><section class="modal" role="dialog" aria-modal="true" aria-label="'+h(title)+'">'+
      '<div class="modal-header"><div><h2>'+h(title)+'</h2><p>'+h(description || '')+'</p></div>'+
      '<button class="close" data-action="close-modal" aria-label="Close dialog">×</button></div>'+body+
      (actions?'<div class="modal-actions">'+actions+'</div>':'')+'</section></div>');
    const input = byId('modalBackdrop').querySelector('input:not([type="file"]),textarea,button');
    if (input) input.focus();
  }
  function closeModal() {
    const el = byId('modalBackdrop');
    if (el) el.remove();
  }
  function openWordForm(id) {
    const word = id ? db.words.find((w) => w.id===id) : null;
    const decks = allDecks();
    const deck = word?.deck || (selectedDeck==='all'?'My Words':selectedDeck);
    const parts = POS.includes(word?.partOfSpeech) ? POS : [word.partOfSpeech,...POS];
    modal(word?'Edit word':'Add a new word','Save a word, its meaning, and an example sentence.',
      '<form id="wordForm" data-id="'+h(word?.id || '')+'">'+
      '<div class="form-row"><div class="field"><label for="wordInput">Word *</label><input id="wordInput" name="word" required maxlength="160" value="'+h(word?.word||'')+'" placeholder="e.g., Resilient"></div>'+
      '<div class="field"><label for="posInput">Part of speech</label><select id="posInput" name="partOfSpeech">'+parts.map((p) => '<option value="'+h(p)+'" '+(word?.partOfSpeech===p?'selected':'')+'>'+h(p)+'</option>').join('')+'</select></div></div>'+
      '<div class="field"><label for="defInput">Definition *</label><textarea id="defInput" name="definition" required maxlength="1000" placeholder="What does this word mean?">'+h(word?.definition||'')+'</textarea></div>'+
      '<div class="field"><label for="sentenceInput">Example sentence (optional)</label><textarea id="sentenceInput" name="sentence" maxlength="1200" placeholder="Use the word in a sentence…">'+h(word?.sentence||'')+'</textarea></div>'+
      '<div class="field"><label for="deckInput">School unit / word list *</label><input id="deckInput" name="deck" list="existingDecks" maxlength="120" required value="'+h(deck)+'" placeholder="e.g., Unit 3"><datalist id="existingDecks">'+decks.map((d) => '<option value="'+h(d)+'"></option>').join('')+'</datalist></div>'+
      '<div class="modal-actions"><button type="button" class="button outline" data-action="close-modal">Cancel</button><button class="button primary" type="submit">'+(word?'Save changes':'Add word')+'</button></div></form>');
  }
  function saveWord(form) {
    const oldId = form.dataset.id;
    const record = {word:form.elements.word.value.trim(),partOfSpeech:form.elements.partOfSpeech.value,
      definition:form.elements.definition.value.trim(),sentence:form.elements.sentence.value.trim(),deck:form.elements.deck.value.trim()};
    if (!record.word || !record.definition || !record.deck) {toast('Please include the word, its meaning, and a word list.');return;}
    if (db.words.some((w) => w.id!==oldId && keyFor(w)===keyFor(record))) {toast('That word already exists in this list.');return;}
    if (oldId) {
      const index = db.words.findIndex((w) => w.id===oldId);
      if (index<0) return;
      db.words[index] = {id:oldId,...record};
      if (seedWords.some((w) => w.id===oldId) && !db.editedSeedIds.includes(oldId)) db.editedSeedIds.push(oldId);
    } else {
      db.words.push({id:randomId(),...record});
    }
    save();closeModal();render();
    toast(oldId?'Word updated!':'Word added! ✨');
  }
  function deleteWord(id) {
    const word=db.words.find((w)=>w.id===id);
    if (!word || !window.confirm('Delete “'+word.word+'” from '+word.deck+'? Its saved progress will also be removed.')) return;
    db.words=db.words.filter((w)=>w.id!==id);
    delete db.progress[id];
    if (seedWords.some((w)=>w.id===id) && !db.deletedSeedIds.includes(id)) db.deletedSeedIds.push(id);
    save();render();toast('Word deleted.');
  }
  function parseCsvLine(line) {
    const out=[]; let field='',quoted=false;
    for (let i=0;i<line.length;i++) {
      const ch=line[i];
      if (ch === '"') {
        if (quoted && line[i+1]==='"') {field+='"';i++;} else quoted=!quoted;
      } else if (ch===',' && !quoted) {out.push(field.trim());field='';}
      else field+=ch;
    }
    out.push(field.trim());return out;
  }
  function parseText(text,deck) {
    const out=[],invalid=[];
    const duplicates=new Set(db.words.map(keyFor));
    const lines=String(text || '').replace(/^\uFEFF/,'').split(/\r?\n/);
    for (let i=0;i<lines.length;i++) {
      const line=lines[i].trim();
      if (!line || line.startsWith('#')) continue;
      let parts = line.includes('|') ? line.split('|') : line.includes('\t') ? line.split('\t') : parseCsvLine(line);
      parts=parts.map((v)=>v.trim());
      if (i===0 && /^(word|vocabulary)$/i.test(parts[0]) && /^(definition|meaning|part of speech|pos)$/i.test(parts[1]||'')) continue;
      if (parts.length<2 || !parts[0] || !parts[1]) {invalid.push(i+1);continue;}
      let word,partOfSpeech,definition,sentence;
      if (parts.length>=4) [word,partOfSpeech,definition,sentence]=[parts[0],parts[1],parts[2],parts.slice(3).join(' | ')];
      else if (parts.length===3 && /^(noun|verb|adjective|adverb|noun\/verb|pronoun|adj\.?|adv\.?|v\.?|n\.?)$/i.test(parts[1])) {
        [word,partOfSpeech,definition]=parts;sentence='';
      } else {
        word=parts[0];partOfSpeech='Other';definition=parts[1];sentence=parts.length===3?parts[2]:'';
      }
      if (!word || !definition) {invalid.push(i+1);continue;}
      const record={id:randomId(),word:word.slice(0,160),partOfSpeech:(partOfSpeech||'Other').slice(0,64),
        definition:definition.slice(0,1000),sentence:(sentence||'').slice(0,1200),deck};
      const duplicate=duplicates.has(keyFor(record));
      out.push({record,duplicate});
      duplicates.add(keyFor(record));
    }
    return {out,invalid};
  }
  function openImport() {
    importPreview=[];
    modal('Import vocabulary','Paste a school list or choose a text / CSV file.',
      '<div class="field"><label for="importDeck">Add words to this list</label><input id="importDeck" value="'+h(selectedDeck==='all'?'My Words':selectedDeck)+'" list="existingDecks" maxlength="120">'+
      '<datalist id="existingDecks">'+allDecks().map((d)=>'<option value="'+h(d)+'"></option>').join('')+'</datalist></div>'+
      '<div class="field"><label for="importText">Paste your words</label><textarea id="importText" style="min-height:160px" placeholder="Word | Part of speech | Definition | Example sentence"></textarea></div>'+
      '<div class="field"><label for="importFile">Or select a .txt / .csv file</label><input id="importFile" type="file" accept=".txt,.csv,text/plain,text/csv"></div>'+
      '<p class="helper">One word per line. Use |, a tab, or CSV commas. Works with “Word | Meaning” or “Word | Part of speech | Definition | Sentence”.</p>'+
      '<div class="code-example">Dour | Adjective | Severe; gloomy | He looked dour.<br>Eschew | To avoid or shun</div>'+
      '<div id="importResult"></div>',
      '<button class="button outline" data-action="close-modal">Cancel</button>'+
      '<button class="button soft" data-action="preview-import">Preview words</button>'+
      '<button class="button primary" data-action="confirm-import" id="confirmImport" disabled>Import words</button>');
  }
  function previewImport() {
    const deck=byId('importDeck')?.value.trim() || '';
    const raw=byId('importText')?.value || '';
    if (!deck) {toast('Please name a word list.');return;}
    const parsed=parseText(raw,deck);
    importPreview=parsed.out;
    const available=parsed.out.filter((x)=>!x.duplicate);
    const root=byId('importResult');
    root.innerHTML = '<div class="warning">'+available.length+' new word(s) ready · '+parsed.out.filter((x)=>x.duplicate).length+' duplicate(s) skipped'+
      (parsed.invalid.length ? ' · '+parsed.invalid.length+' invalid line(s) skipped':'')+'</div>'+
      (parsed.out.length?'<div class="preview-list">'+parsed.out.slice(0,30).map((x)=>'<div class="preview-row"><strong>'+h(x.record.word)+'</strong> — '+h(x.record.definition)+
      (x.duplicate?' <span class="pill learning">Duplicate</span>':'')+'</div>').join('')+
      (parsed.out.length>30?'<div class="preview-row">…and '+(parsed.out.length-30)+' more</div>':'')+'</div>':'');
    byId('confirmImport').disabled=!available.length;
  }
  function confirmImport() {
    if (!importPreview.length) return;
    const toAdd=importPreview.filter((x)=>!x.duplicate && !db.words.some((w)=>keyFor(w)===keyFor(x.record))).map((x)=>x.record);
    db.words.push(...toAdd);save();closeModal();render();
    toast(toAdd.length+' word'+(toAdd.length===1?'':'s')+' imported! ✨');
  }
  function openBackup() {
    modal('Backup & restore','Keep an extra copy of your vocabulary and progress.',
      '<div class="panel" style="margin-bottom:15px"><div class="panel-title">↓ Download a complete backup</div>'+
      '<p class="helper">Includes all words, definitions, quiz history, and your word-by-word progress. Save the JSON file somewhere safe, or upload it to a private GitHub repository.</p>'+
      '<button class="button primary" data-action="download-backup">Download backup.json</button></div>'+
      '<div class="panel"><div class="panel-title">↑ Restore an earlier backup</div>'+
      '<p class="helper">Restoring replaces the vocabulary and progress currently in this browser. A confirmation is required.</p>'+
      '<div class="field"><label for="restoreFile">Choose a backup JSON file</label><input id="restoreFile" type="file" accept=".json,application/json"></div>'+
      '<button class="button outline" data-action="restore-backup">Restore backup</button></div>'+
      '<div class="warning">Progress is stored only in this browser and does not automatically sync between devices. Download backups regularly.</div>',
      '<button class="button outline" data-action="close-modal">Close</button>');
  }
  function downloadBackup() {
    const payload=JSON.stringify({app:'Vocabulary Master',exportedAt:new Date().toISOString(),data:db},null,2);
    const blob=new Blob([payload],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a');a.href=url;
    a.download='vocab-master-backup-'+new Date().toISOString().slice(0,10)+'.json';
    document.body.appendChild(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    toast('Backup downloaded. Keep it somewhere safe!');
  }
  async function restoreBackup() {
    const file=byId('restoreFile')?.files?.[0];
    if (!file) {toast('Choose a backup file first.');return;}
    if (file.size>3_000_000) {toast('That backup is too large to import.');return;}
    try {
      const json=JSON.parse(await file.text());
      const candidate=json.data || json;
      if (!candidate || !Array.isArray(candidate.words) || !candidate.progress || typeof candidate.progress !== 'object') throw new Error('Not a Vocabulary Master backup');
      if (!window.confirm('Restore '+candidate.words.length+' words? This replaces your current saved words and progress on this device.')) return;
      db=sanitizeDb(candidate);
      mergeSeedWords();
      flash=null;quiz=null;selectedDeck='all';save();closeModal();render();
      toast('Backup restored successfully! 🎉');
    } catch(error) {toast('Could not restore that file. Please choose a Vocabulary Master JSON backup.');}
  }
  function onClick(event) {
    const target=event.target.closest('button');
    if (!target) {
      if (event.target.id==='modalBackdrop') closeModal();
      return;
    }
    if (target.dataset.view) {navigate(target.dataset.view);return;}
    if (target.dataset.deck != null) {
      selectedDeck=target.dataset.deck;flash=null;quiz=null;searchText='';render();return;
    }
    const action=target.dataset.action;
    if (!action) return;
    if (action==='open-add') openWordForm();
    else if (action==='edit-word') openWordForm(target.dataset.id);
    else if (action==='delete-word') deleteWord(target.dataset.id);
    else if (action==='open-import') openImport();
    else if (action==='preview-import') previewImport();
    else if (action==='confirm-import') confirmImport();
    else if (action==='open-backup') openBackup();
    else if (action==='download-backup') downloadBackup();
    else if (action==='restore-backup') restoreBackup();
    else if (action==='close-modal') closeModal();
    else if (action==='start-flash') startFlash(target.dataset.scope==='due');
    else if (action==='stop-flash') {flash=null;render();}
    else if (action==='flash-flip') {if (flash){flash.revealed=!flash.revealed;render();}}
    else if (action==='flash-rate') rateFlash(target.dataset.correct==='true');
    else if (action==='start-quiz') startQuiz(target.dataset.mode,target.dataset.kind);
    else if (action==='pick-answer') answerQuiz(target.dataset.id);
    else if (action==='quiz-next') advanceQuiz();
    else if (action==='stop-quiz') {quiz=null;render();}
    else if (action==='restart-quiz') {const mode=quiz.mode;const kind=quiz.questions[0]?.kind || 'meaning';startQuiz(mode,kind);}
  }
  function onSubmit(event) {
    if (event.target.id==='wordForm') {event.preventDefault();saveWord(event.target);}
    if (event.target.id==='spellForm') {event.preventDefault();const input=byId('spellAnswer');if (input?.value.trim()) answerQuiz(input.value);}
  }
  async function onChange(event) {
    if (event.target.id==='deckFilter') {selectedDeck=event.target.value;flash=null;quiz=null;searchText='';render();}
    if (event.target.id==='importFile') {
      const file=event.target.files?.[0];
      if (!file) return;
      if (file.size>1_000_000) {toast('Choose a text file smaller than 1 MB.');return;}
      try {
        byId('importText').value=await file.text();
        previewImport();
      } catch(error){toast('Could not read that text file.');}
    }
  }
  function onInput(event) {
    if (event.target.id==='wordSearch') {searchText=event.target.value;drawWordsTable();}
    if (event.target.id==='importText' || event.target.id==='importDeck') {
      importPreview=[];
      const button=byId('confirmImport');if (button) button.disabled=true;
    }
  }
  async function initialize() {
    try {
      const response=await fetch('./data/vocabulary.json',{cache:'no-store'});
      if (!response.ok) throw new Error('HTTP '+response.status);
      const parsed=await response.json();
      seedWords=Array.isArray(parsed)?parsed.filter((w)=>w && w.id && w.word && w.definition):[];
    } catch(error) {console.warn('Starter vocabulary could not be loaded:',error);toast('Could not load shared starter words. You can still add your own words.');}
    db=loadStored() || newDb();
    mergeSeedWords();
    save();
    const fromHash=window.location.hash.replace('#','');
    view=NAV_LABELS[fromHash]?fromHash:'home';
    document.addEventListener('click',onClick);
    document.addEventListener('submit',onSubmit);
    document.addEventListener('change',onChange);
    document.addEventListener('input',onInput);
    window.addEventListener('hashchange',() => {
      const next=location.hash.replace('#','');
      if (NAV_LABELS[next] && view!==next) {view=next;render();}
    });
    document.addEventListener('keydown',(e) => {if (e.key==='Escape' && byId('modalBackdrop')) closeModal();});
    render();
  }
  initialize();
})();
