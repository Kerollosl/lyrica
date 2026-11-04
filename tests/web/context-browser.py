"""Context alignment, legacy cache preservation and manual correction checks."""
import re
from playwright.sync_api import sync_playwright, expect
from support import launch, visit, original_api_fixtures, reader_options, assert_no_overflow

text='Quiero que sepas\nque puedes contar conmigo.\n\nNo te rindas.'
with sync_playwright() as p:
    browser=launch(p)
    context=browser.new_context(viewport={'width':390,'height':844},service_workers='block')
    context.add_init_script('''
      Object.defineProperty(window,'Translator',{value:undefined,configurable:true});
      Object.defineProperty(window,'LanguageDetector',{value:undefined,configurable:true});
      window.requests=[];
      window.Worker=class {
        postMessage(data){
          window.requests.push(data);
          const lines=data.style==='context'
            ? ['I want you to know that you can count on me.','','',"Don't give up."]
            : ['I want you to know','you can count on me.','',"Don't give up."];
          this.timer=setTimeout(()=>{
            lines.forEach((text,index)=>this.onmessage?.({data:{type:'line',text,index,total:4}}));
            this.onmessage?.({data:{type:'complete',lines}});
          },100);
        }
        terminate(){clearTimeout(this.timer);}
      };
    ''')
    page=context.new_page();errors=[]
    page.on('pageerror',lambda e:errors.append(str(e)))
    original_api_fixtures(page);visit(page)
    page.evaluate('''async text=>{
      const db=await import('./store.mjs');
      await db.setPreference('settings',{target:'en',cache:true});
      await db.putSong({id:'123',song:{id:123,title:'A test song',artist:'Test Artist',album:'Test Album',duration:180},document:{text,source:'manual',language:'es'},translations:{'es:en':['I want you to know','I can count on you.','',"Don't give up."]},favorite:false,viewed:Date.now()});
    }''',text)
    page.reload()
    page.get_by_role('searchbox').fill('Test Artist')
    page.get_by_role('button',name='Search',exact=True).click()
    page.get_by_role('button',name=re.compile('A test song')).click()
    expect(page.get_by_text('I can count on you.',exact=True)).to_be_visible()
    expect(page.locator('#translation-status')).to_contain_text('updated translator')
    assert page.evaluate('requests.length')==0
    reader_options(page).get_by_role('button',name='Retranslate',exact=True).click()
    page.get_by_role('button',name='Download & translate',exact=True).click()
    expect(page.locator('.lyric-row')).to_have_count(2)
    expect(page.locator('.lyric-row').first.locator('span').first).to_have_text(text.split('\n\n')[0])
    expect(page.locator('.translated').first).to_have_text('I want you to know that you can count on me.')
    page.locator('.lyric-row').first.click()
    expect(page.locator('.lyric-row').first).to_have_attribute('aria-pressed','true')
    saved=page.evaluate("import('./store.mjs').then(db=>db.getSong('123'))")
    assert saved['translations']['es:en'][1]=='I can count on you.'
    assert saved['translations']['es:en:q2:context'][0]=='I want you to know that you can count on me.'
    menu=reader_options(page)
    menu.locator('#translation-style').select_option('lines')
    expect(page.locator('.lyric-row')).to_have_count(3)
    expect(page.locator('.translated').nth(1)).to_have_text('you can count on me.')
    count=page.evaluate('requests.length')
    reader_options(page).locator('#translation-style').select_option('context')
    expect(page.locator('.lyric-row')).to_have_count(2)
    assert page.evaluate('requests.length')==count,'cached style switch started inference'
    reader_options(page).get_by_role('button',name='Paste a translation',exact=True).click()
    page.locator('#manual-text').fill('My corrected first line\nMy corrected second line\nDo not give up.')
    page.get_by_role('button',name='Use translation',exact=True).click()
    expect(page.locator('.lyric-row')).to_have_count(3)
    expect(page.locator('.translated').first).to_have_text('My corrected first line')
    saved=page.evaluate("import('./store.mjs').then(db=>db.getSong('123'))")
    assert 'es:en:q2:context' not in saved['translations']
    assert saved['translations']['es:en'][0]=='My corrected first line'
    for width in [320,390]:
        page.set_viewport_size({'width':width,'height':844})
        reader_options(page)
        assert_no_overflow(page,'context controls')
    assert not errors,errors
    browser.close()
    print('PASS: legacy cache preserved, explicit refresh, phrase alignment/highlight, independent cached styles, manual correction and compact reader options')
