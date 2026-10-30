"""Deterministic mobile UI checks. Actual model inference is checked by models.py."""
import sys
from playwright.sync_api import sync_playwright,expect
from support import launch,visit,navigate,original_api_fixtures,assert_no_overflow
with sync_playwright() as p:
 browser=launch(p)
 context=browser.new_context(viewport={'width':390,'height':844},service_workers='block')
 context.add_init_script('''
 Object.defineProperty(window,'Translator',{value:undefined,configurable:true});
 Object.defineProperty(window,'LanguageDetector',{value:undefined,configurable:true});
 window.modelStarts=[];window.modelStops=0;
 window.Worker=class {
  postMessage(data){
   window.modelStarts.push(data.source);
   this.timer=setTimeout(()=>{
    this.onmessage?.({data:{type:'line',index:0,text:'Hello world',total:3}});
    this.later=setTimeout(()=>{
      this.onmessage?.({data:{type:'line',index:1,text:'',total:3}});
      this.onmessage?.({data:{type:'line',index:2,text:'Good morning',total:3}});
      this.onmessage?.({data:{type:'complete',lines:['Hello world','','Good morning']}});
    },500);
   },100);
  }
  terminate(){clearTimeout(this.timer);clearTimeout(this.later);window.modelStops++;}
 };
 ''')
 page=context.new_page();errors=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 original_api_fixtures(page);visit(page)
 page.get_by_role('searchbox').fill('Test Artist')
 page.get_by_role('button',name='Search',exact=True).click()
 page.get_by_role('button',name='A test song',exact=False).click()
 for code in ['es','ar','fr']:
  page.locator('#source-language').select_option(code)
  button=page.get_by_role('button',name='Download & translate',exact=True)
  expect(button).to_be_visible()
  assert len(page.evaluate('modelStarts'))==['es','ar','fr'].index(code)
  expect(page.locator('#translation-status')).to_contain_text('110–120 MB')
  button.click()
  expect(page.locator('.translated').first).to_have_text('Hello world')
  expect(page.locator('.translated').last).to_have_text('Good morning')
  expect(page.locator('.verse-space')).to_have_count(1)
  expect(page.locator('#translation-status')).to_contain_text('Translated on your device.')
 assert page.evaluate('modelStarts')==['es','ar','fr']
 assert_no_overflow(page,'mobile model status')
 # In-memory translations switch instantly without another worker call.
 page.locator('#source-language').select_option('es')
 expect(page.locator('#translation-status')).to_contain_text('Translation from this session')
 assert page.evaluate('modelStarts')==['es','ar','fr']
 # Editing lyrics invalidates translations; cancel an actual pending UI operation.
 page.locator('details.reader-options summary').click()
 page.get_by_role('button',name='Paste or replace lyrics',exact=True).click()
 page.locator('#manual-text').fill('Un nuevo día\n\nUn nuevo sol')
 page.get_by_role('button',name='Use lyrics',exact=True).click()
 page.locator('#source-language').select_option('ar')
 page.get_by_role('button',name='Download & translate',exact=True).click()
 page.get_by_role('button',name='Cancel',exact=True).click()
 expect(page.locator('#translation-status')).to_contain_text('Translation stopped')
 expect(page.locator('.translated').first).to_have_text('—')
 navigate(page,'settings')
 page.get_by_role('button',name='Remove downloaded language models').click()
 page.get_by_role('button',name='Remove models',exact=True).click()
 expect(page.locator('dialog')).not_to_be_visible()
 assert not errors,errors
 browser.close()
 print('PASS mobile fallback: explicit per-language download, streamed aligned output, three pairs, cached switch, model removal, no overflow')
