import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
const entry = process.env.QA_ENTRY || fileURLToPath(new URL('../dist/index.js',import.meta.url));
const fixture = fileURLToPath(new URL('./fixtures/configuration.cjs',import.meta.url));
const secret = 'dummy-offline-secret';
const text = r => r.content.map(x => x.text || '').join('\n');
async function session(env,run) {
 const c = new Client({name:'configuration-qa',version:'1.0.0'});
 const t = new StdioClientTransport({command:process.execPath,args:['--require',fixture,entry],env,stderr:'pipe'});
 let stderr='';t.stderr.on('data',chunk => stderr += chunk);
 try { await c.connect(t); await run(c,()=>stderr); } finally { await c.close(); }
}
const call = (c,args={}) => c.callTool({name:'benchmark_model',arguments:{provider:'OpenAI',model:'current-model',...args}});
const bulk = c => c.callTool({name:'benchmark_models',arguments:{}});
const valid = { OPENAI_API_KEY:secret, QA_EXPECT_URL:'https://api.openai.com/v1/chat/completions', QA_TOKEN_PARAM:'max_completion_tokens' };
test('current arbitrary model IDs work, including former whitelist rejections', async()=>{
 for (const [provider,model,key,url,param] of [
  ['Anthropic','claude-sonnet-4-6','ANTHROPIC_API_KEY','https://api.anthropic.com/v1/messages','max_tokens'],
  ['DeepSeek','deepseek-flash','DEEPSEEK_API_KEY','https://api.deepseek.com/v1/chat/completions','max_tokens'],
  ['Groq','openai/gpt-oss-20b','GROQ_API_KEY','https://api.groq.com/openai/v1/chat/completions','max_completion_tokens'],
 ]) await session({[key]:secret,QA_EXPECT_URL:url,QA_EXPECT_MODEL:model,QA_TOKEN_PARAM:param},async(c,stderr)=>{
  const r=await call(c,{provider,model});assert.equal(r.isError,false,text(r));assert.match(stderr(),/request verified/);
 });
});
test('bulk requests require explicit models; unused keys cannot initiate requests', async()=>{
 await session({...valid,QA_NO_FETCH:'true'},async(c,stderr)=>{
  assert.match(text(await bulk(c)),/No bulk models selected/);
  const listed=text(await c.callTool({name:'list_providers',arguments:{}}));assert.match(listed,/OPENAI_MODELS/);assert.doesNotMatch(listed,new RegExp(secret));assert.equal(stderr(),'');
 });
 await session({...valid,OPENAI_MODELS:' current-model, current-model ',ANTHROPIC_API_KEY:secret},async(c,stderr)=>{
  assert.equal((await bulk(c)).isError,false);assert.equal((stderr().match(/request verified/g)||[]).length,1);
 });
});
test('all bulk selections preflight before any fetch and invalid config never exposes keys',async()=>{
 for(const models of ['one,,two',Array(9).fill('a').join(','),'a\nb']) await session({...valid,OPENAI_MODELS:models,QA_NO_FETCH:'true'},async(c,stderr)=>{
  const r=await bulk(c);assert.equal(r.isError,true);assert.match(text(r),/1–8/);assert.doesNotMatch(text(r),new RegExp(secret));assert.equal(stderr(),'');
 });
 await session({...valid,OPENAI_MODELS:'current-model',KIMI_API_KEY:secret,KIMI_MODELS:'current-model',QA_NO_FETCH:'true'},async(c,stderr)=>{
  const r=await bulk(c);assert.equal(r.isError,true);assert.match(text(r),/KIMI_REGION/);assert.equal(stderr(),'');
 });
});
for(const [provider,prefix,global,cn,param] of [
 ['MiniMax','MINIMAX','https://api.minimax.io/v1','https://api.minimax.cn/v1','max_completion_tokens'],
 ['Zhipu/ZAI','ZAI','https://api.z.ai/api/paas/v4','https://open.bigmodel.cn/api/paas/v4','max_tokens'],
 ['Kimi/Moonshot','KIMI','https://api.moonshot.ai/v1','https://api.moonshot.cn/v1','max_tokens'],
]) {
 test(`${provider}: explicit region routes only to fixed official endpoint`,async()=>{
  for(const [region,base] of [['global',global],['cn',cn]]) await session({[`${prefix}_API_KEY`]:secret,[`${prefix}_REGION`]:region,QA_EXPECT_URL:`${base}/chat/completions`,QA_TOKEN_PARAM:param},async(c,stderr)=>{
   const r=await call(c,{provider});assert.equal(r.isError,false,text(r));assert.match(stderr(),/request verified/);
  });
 });
 test(`${provider}: missing/invalid region fails before fetch, without reflecting secret`,async()=>{
  for(const region of ['', 'https://evil.example', secret, '__proto__']) await session({[`${prefix}_API_KEY`]:secret,[`${prefix}_REGION`]:region,QA_NO_FETCH:'true'},async(c,stderr)=>{
   const r=await call(c,{provider});assert.equal(r.isError,true);assert.match(text(r),/REGION/);assert.doesNotMatch(text(r),new RegExp(secret));assert.equal(stderr(),'');
  });
 });
}
test('thinking is opt-in, constrained and never automatically added for arbitrary models',async()=>{
 for(const thinking of ['enabled','disabled']) await session({DEEPSEEK_API_KEY:secret,DEEPSEEK_THINKING:thinking,QA_THINKING:thinking,QA_EXPECT_URL:'https://api.deepseek.com/v1/chat/completions'},async c=>{
  assert.equal((await call(c,{provider:'DeepSeek'})).isError,false);
 });
 for(const mode of ['invalid','disabled']) await session({...valid,OPENAI_THINKING:mode,QA_NO_FETCH:'true'},async(c,stderr)=>{
  const r=await call(c);assert.equal(r.isError,true);assert.match(text(r),/unsupported/);assert.equal(stderr(),'');
 });
});
test('token budgets bounded; invalid or empty model input never calls provider',async()=>{
 for(const limit of [1,4096]) await session({...valid,QA_TOKEN_LIMIT:String(limit)},async c=>assert.equal((await call(c,{max_tokens:limit})).isError,false));
 await session({...valid,QA_NO_FETCH:'true'},async(c,stderr)=>{
  for(const max_tokens of [0,4097,-1,1.5,'256']) assert.equal((await call(c,{max_tokens})).isError,true);
  for(const model of ['', '  ', 'a\nb', 'a'.repeat(257)]) assert.equal((await call(c,{model})).isError,true);
  assert.equal(stderr(),'');
 });
});

test('MiniMax accepts adaptive/disabled only; ZAI supports explicit thinking modes',async()=>{
 for(const [provider,prefix,url,modes,param] of [
  ['MiniMax','MINIMAX','https://api.minimax.io/v1/chat/completions',['adaptive','disabled'],'max_completion_tokens'],
  ['Zhipu/ZAI','ZAI','https://api.z.ai/api/paas/v4/chat/completions',['enabled','disabled'],'max_tokens'],
 ]) for(const mode of modes) await session({[`${prefix}_API_KEY`]:secret,[`${prefix}_REGION`]:'global',[`${prefix}_THINKING`]:mode,QA_EXPECT_URL:url,QA_THINKING:mode,QA_TOKEN_PARAM:param},async c=>{
  assert.equal((await call(c,{provider})).isError,false);
 });
 await session({MINIMAX_API_KEY:secret,MINIMAX_REGION:'global',MINIMAX_THINKING:'enabled',QA_NO_FETCH:'true'},async(c,stderr)=>{
  const r=await call(c,{provider:'MiniMax'});assert.equal(r.isError,true);assert.match(text(r),/THINKING/);assert.equal(stderr(),'');
 });
});
