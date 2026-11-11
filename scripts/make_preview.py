#!/usr/bin/env python3
"""Generate tests/popup-preview.html: the popup with a stubbed extension API (dev only)."""
import re, pathlib
root = pathlib.Path(__file__).resolve().parent.parent
p = (root / "src/popup/popup.html").read_text()
stub = '''<script>
const store={speed:1,siteSpeeds:{"www.youtube.com":1.5},skipCount:42,savedSeconds:5400};
globalThis.chrome={storage:{local:{get:async()=>({...store}),set:async(x)=>Object.assign(store,x)},onChanged:{addListener(){}}},tabs:{query:async()=>[{url:"https://www.youtube.com/watch?v=demo"}]}};
</script>'''
p = p.replace('<link rel="stylesheet" href="popup.css">', '<link rel="stylesheet" href="../src/popup/popup.css">' + stub)
p = re.sub(r'src="(\.\./shared/)', r'src="../src/shared/', p)
p = re.sub(r'src="(i18n|popup)\.js"', r'src="../src/popup/\1.js"', p)
(root / "tests/popup-preview.html").write_text(p)
