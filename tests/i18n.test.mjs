import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function setup(saved={}, fail=false) {
  const values={...saved};
  const context={window:{}, Intl, localStorage:{
    getItem:k=>values[k]??null,
    setItem:(k,v)=>{if(fail) throw new Error('Blocked');values[k]=v;}
  }};
  vm.runInNewContext(fs.readFileSync(path.join(root,'src/i18n.js'),'utf8'),context);
  return {I:context.window.FalconI18n,values};
}
test('English default and Russian saved locale',()=>{
  assert.equal(setup().I.language,'en');
  assert.equal(setup({'falcon-jobster:locale:v1':'ru'}).I.language,'ru');
});
test('Unknown saved locale falls back to English',()=>{
  assert.equal(setup({'falcon-jobster:locale:v1':'de'}).I.language,'en');
});
test('Locale preference uses an independent key',()=>{
  const {I,values}=setup({'falcon-jobster:interactive:v1':'untouched'});
  assert.equal(I.setLanguage('ru'),true);
  assert.equal(values[I.KEY],'ru');
  assert.equal(values['falcon-jobster:interactive:v1'],'untouched');
});
test('Storage failures preserve in-memory localization',()=>{
  const {I}=setup({},true);assert.equal(I.setLanguage('ru'),false);
  assert.equal(I.t('Candidates'),'Кандидаты');
});
test('Unsupported language is rejected without mutation',()=>{
  const {I}=setup();assert.equal(I.setLanguage('uz'),false);assert.equal(I.language,'en');
});
test('Russian plural rules include teens and twenty-one',()=>{
  const {I}=setup();I.setLanguage('ru');
  for(const [n,s] of [[0,'0 кандидатов'],[1,'1 кандидат'],[2,'2 кандидата'],[5,'5 кандидатов'],[11,'11 кандидатов'],[21,'21 кандидат'],[22,'22 кандидата']]) assert.equal(I.count('candidate',n),s);
  assert.equal(I.count('day',14),'14 дней');
});
test('Week starts Monday in Russian and Sunday in English',()=>{
  const {I}=setup();assert.equal(I.weekStart,0);assert.equal(I.weekdays()[0],'Sun');
  I.setLanguage('ru');assert.equal(I.weekStart,1);assert.equal(I.weekdays()[0],'Пн');
});
test('Locale-sensitive numbers and relative dates',()=>{
  const {I}=setup();I.setLanguage('ru');
  assert.equal(I.number(1.5,{minimumFractionDigits:1}),'1,5');
  assert.equal(I.relative(0),'Сегодня');assert.equal(I.relative(1),'Вчера');
  assert.match(I.relative(4),/4 дня назад/);
});
test('Interpolation never reinterprets inserted placeholders or dollars',()=>{
  const {I}=setup();I.setLanguage('ru');
  assert.equal(I.t('Open {0}',['New {1} $&']), 'Открыть: New {1} $&');
  assert.equal(I.t('{{first_name}}'), '{{first_name}}');
});
test('System activity labels translate without translating names',()=>{
  const {I}=setup();I.setLanguage('ru');
  assert.equal(I.message('New moved to Screening'),'New — переход на этап: Отбор');
  assert.equal(I.message('Moved to Offer (sample history)'),'Переход на этап: Предложение (тестовая история)');
  assert.equal(I.message('A free-form user note'),'A free-form user note');
});
test('Unknown keys and dangerous object-property names stay plain text',()=>{
  const {I}=setup();I.setLanguage('ru');
  for(const text of ['Custom source','__proto__','constructor'])assert.equal(I.t(text),text);
});
test('Every explicit literal translation call has a catalog entry',()=>{
  const {I}=setup();
  const source=fs.readFileSync(path.join(root,'app.js'),'utf8');
  const calls=source.matchAll(/I\.t\((("(?:\\.|[^"\\])*")|('(?:\\.|[^'\\])*'))/g);
  const keys=new Set(I.dictionaryKeys);
  for(const match of calls){
    const literal=match[1];
    const key=vm.runInNewContext(literal);
    assert.ok(keys.has(key),`Missing Russian key: ${key}`);
  }
});
