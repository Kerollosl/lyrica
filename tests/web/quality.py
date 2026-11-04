"""Opt-in real-model checks of connected phrases, not an overall accuracy score.
Serve web/ first. Downloads ~350 MB. All test text is authored, not song lyrics.
"""
import json
from pathlib import Path
from playwright.sync_api import sync_playwright
from support import launch, BASE_URL

cases = json.loads(Path(__file__).with_name('quality-cases.json').read_text())
with sync_playwright() as p:
    browser = launch(p)
    context = browser.new_context(viewport={'width': 390, 'height': 844}, service_workers='block')
    page = context.new_page()
    page.goto(BASE_URL + '/')
    results = []
    for case in cases:
        result = page.evaluate('''async ({source,input}) => {
          const {translateLines} = await import('./translation.mjs');
          const seen=[];
          const lines=await translateLines(input,source,'en',{
            signal:new AbortController().signal,engine:'model',style:'context',
            onLine:(index,text)=>seen.push({index,text})
          });
          return {lines,seen};
        }''', case)
        assert len(result['lines']) == len(case['input'].split('\n'))
        assert result['lines'][0] and result['lines'][1] == '', result
        candidate = result['lines'][0]
        for phrase in case.get('mustContain', []):
            assert phrase in candidate.lower(), (case, candidate)
        recorded = {**case, 'candidate': candidate}
        results.append(recorded)
        print(json.dumps(recorded, ensure_ascii=False), flush=True)
    browser.close()
print('PASS: 15 contextual phrases and three specific meaning regressions; known model failures remain documented.', flush=True)
