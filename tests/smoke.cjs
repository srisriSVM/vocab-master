'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

const source = read('app.js');
new Function(source); // Parse-check all client JavaScript.
const seed = JSON.parse(read('data/vocabulary.json'));
assert.ok(seed.length >= 12, 'Expected the initial vocabulary list to remain available');
assert.equal(new Set(seed.map((w) => w.id)).size, seed.length, 'IDs must be unique');
for (const word of seed) {
  for (const field of ['id','word','definition','partOfSpeech','sentence','deck']) {
    assert.equal(typeof word[field], 'string', word.word + ' is missing ' + field);
    assert.ok(word[field].trim(), word.word + ' has blank ' + field);
  }
}
for (const file of ['index.html','styles.css','favicon.svg','.github/workflows/deploy.yml']) {
  assert.ok(fs.existsSync(path.join(root,file)), 'Missing ' + file);
}

const withExports = source.replace(/\s*initialize\(\);\s*\}\)\(\);\s*$/,
  '  return {sanitizeDb,mergeSeedWords,counts,makeQuestion,parseText,startQuiz,answerQuiz,advanceQuiz,startFlash,rateFlash,openWordForm,createDeck,allDecks,getDb:()=>db,getQuiz:()=>quiz,getFlash:()=>flash,setDb:(x)=>{db=x},setSeed:(x)=>{seedWords=x}};\n})();');
assert.notEqual(withExports, source, 'Could not isolate test functions');
const elements = {};
for (const id of ['app','deckFilter','breadcrumb','toast']) {
  elements[id] = {value:'all',innerHTML:'',textContent:'',classList:{add(){},remove(){}}};
}
const modalElement = {remove(){},querySelector(){return {focus(){}}}};
const document = {getElementById:(id)=>elements[id] || (id==='modalBackdrop'?modalElement:null),
  querySelectorAll:()=>[],addEventListener(){},
  body:{insertAdjacentHTML(_position,html){modalElement.html=html;}}};
const window = {location:{hash:'#home'},addEventListener(){},scrollTo(){}};
const saved = {};
const localStorage = {setItem:(key,val)=>{saved[key]=val},getItem:(key)=>saved[key] || null};
const factory = new Function('document','window','localStorage','fetch','return '+withExports.slice(withExports.indexOf('(function () {')));
const app = factory(document,window,localStorage,()=>{});
app.setDb(app.sanitizeDb({words:[],progress:{},history:[]}));
app.setSeed(seed);
app.mergeSeedWords();
assert.equal(app.getDb().words.length,seed.length);
assert.equal(app.counts(app.getDb().words).new,seed.length);

const parsed = app.parseText('Word | Definition\nDour | Severe; gloomy\nNewWord | Noun | A test meaning | A test sentence', 'Notebook Sample');
assert.equal(parsed.out.length,2);
assert.equal(parsed.out[0].duplicate,true);
assert.equal(parsed.out[1].duplicate,false);
assert.equal(parsed.out[1].record.partOfSpeech,'Noun');

for (const word of seed) {
  const q = app.makeQuestion(word,'sentence',seed);
  // Some notebook examples use a different word form (e.g. ambivalence/ambivalent).
  // Such cards correctly fall back to spelling instead of inventing a blank.
  assert.ok(['sentence','spelling'].includes(q.kind), 'Unexpected question kind for '+word.word);
  if (q.kind === 'sentence') {
    assert.ok(q.clozeText.includes('_______'));
    assert.ok(q.clozeAnswer);
  }
}
const multipleChoice = app.makeQuestion(seed[0],'meaning',seed);
assert.equal(multipleChoice.choices.length,4);

app.startQuiz('test','mixed');
let rounds=0;
while (!app.getQuiz().finished && rounds < 20) {
  const q=app.getQuiz().questions[app.getQuiz().index];
  const answer=q.kind==='sentence' ? q.clozeAnswer : (q.kind==='spelling' ? q.word.word : q.word.id);
  app.answerQuiz(answer);
  app.advanceQuiz();
  rounds++;
}
assert.equal(rounds,10);
assert.equal(app.getQuiz().score,10);
assert.equal(app.getDb().history[0].total,10);
assert.ok(Object.keys(app.getDb().progress).length>0);
assert.ok(saved['vocabmaster.data.v1']);

app.startFlash(false);
app.getFlash().revealed=true;
app.rateFlash(true);
assert.equal(app.getFlash().index,1);
assert.equal(app.getFlash().correct,1);

// Regression: an empty Add Word form must open without dereferencing null.
app.openWordForm();
assert.ok(modalElement.html.includes('id="wordForm"'));
app.createDeck({elements:{deck:{value:'Unit 2'}}});
assert.ok(app.allDecks().includes('Unit 2'));
assert.equal(app.getDb().words.filter(w => w.deck==='Unit 2').length,0);
assert.ok(app.sanitizeDb(JSON.parse(JSON.stringify(app.getDb()))).decks.includes('Unit 2'));


console.log('✓ Starter data, import, sentences, quizzes, progress, and flashcards passed');
