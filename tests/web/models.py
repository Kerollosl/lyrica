"""Opt-in real WebAssembly model integration check. Requires the local web server.
Downloads ~350 MB. Uses authored phrases; no commercial lyrics. Chromium at a
mobile viewport is not evidence of real iPhone Safari performance.
"""
import json,time,re,sys
from playwright.sync_api import sync_playwright
from support import launch, BASE_URL
with sync_playwright() as p:
 browser=launch(p)
 context=browser.new_context(viewport={'width':390,'height':844})
 page=context.new_page()
 page.on('console',lambda m: print('BROWSER',m.type,m.text[:180],flush=True) if m.type=='error' else None)
 page.on('pageerror',lambda e:print('PAGE ERROR',e,flush=True))
 page.add_init_script("Object.defineProperty(window, 'Translator', { configurable: true, value: undefined })")
 page.goto(BASE_URL + '/')
 page.evaluate('navigator.serviceWorker.ready')
 page.reload()
 page.wait_for_function('navigator.serviceWorker.controller !== null')
 results=[]
 for source,text in [('es','Hola mundo\n\nEl sol brilla\nHola mundo'),('ar','مرحبا بالعالم\n\nصباح الخير\nمرحبا بالعالم'),('fr','Bonjour le monde\n\nLe soleil brille\nBonjour le monde')]:
  start=time.monotonic()
  print('START',source,flush=True)
  result=page.evaluate('''async ({source,text}) => {
    const t=await import('./translation.mjs');
    const status=await t.translationStatus(source,'en');
    const controller=new AbortController();
    const seen=[];
    const lines=await t.translateLines(text,source,'en',{signal:controller.signal,engine:'model',onLine:(index,text)=>seen.push({index,text})});
    const cached=await (await import('./translation-models.mjs')).modelIsCached(source);
    return {status,lines,seen,cached};
  }''',{'source':source,'text':text})
  result['source']=source;result['seconds']=round(time.monotonic()-start,2)
  print(json.dumps(result,ensure_ascii=False),flush=True)
  assert len(result['lines'])==4 and result['lines'][1]==''
  assert result['lines'][0]==result['lines'][3]
  assert all(re.search('[A-Za-z]',line) for line in result['lines'] if line)
  assert result['cached']
  results.append(result)
 # Reload to discard in-memory models, then verify real offline inference.
 page.reload();page.wait_for_function('navigator.serviceWorker.controller !== null')
 context.set_offline(True)
 print('START offline French',flush=True)
 offline=page.evaluate('''async () => {
 const t=await import('./translation.mjs');
 const status=await t.translationStatus('fr','en');
 const lines=await t.translateLines('Le ciel est bleu','fr','en',{signal:new AbortController().signal,engine:'model'});
 return {status,lines};
 }''')
 print('OFFLINE',json.dumps(offline),flush=True)
 assert offline['status']=='model-ready' and offline['lines'][0]
 context.set_offline(False)
 page.evaluate("import('./translation.mjs').then(t=>t.clearTranslationModels())")
 assert not page.evaluate("import('./translation-models.mjs').then(t=>t.modelIsCached('fr'))")
 print('PASS: three real models, streamed aligned lines, repeated lines, offline reload, cache removal',flush=True)
 # Results are printed; no lyric or model artifact is committed by this test.
 browser.close()
