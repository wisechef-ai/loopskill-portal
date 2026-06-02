#!/usr/bin/env python3
"""Generate whitepaper PDF from markdown using WeasyPrint."""
import re
import sys
from pathlib import Path

# Read the markdown
md_path = Path(__file__).parent.parent / "src/content/blog/recipes-vertical-skill-marketplace-whitepaper.md"
md_text = md_path.read_text()

# Strip frontmatter
md_text = re.sub(r'^---.*?---\n', '', md_text, flags=re.DOTALL)

# Convert markdown to HTML manually (basic, good enough for whitepaper)
def md_to_html(text):
    lines = text.split('\n')
    html_lines = []
    in_table = False
    in_code = False
    in_list = False
    code_lines = []
    
    i = 0
    while i < len(lines):
        line = lines[i]
        
        # Code block
        if line.startswith('```'):
            if in_code:
                in_code = False
                html_lines.append('<pre><code>' + '\n'.join(code_lines) + '</code></pre>')
                code_lines = []
            else:
                in_code = True
            i += 1
            continue
        
        if in_code:
            code_lines.append(line.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;'))
            i += 1
            continue
        
        # Table
        if '|' in line and '---' in line and i > 0 and '|' in lines[i-1]:
            # Skip separator row
            i += 1
            continue
        
        if line.startswith('|') and line.endswith('|'):
            if not in_table:
                html_lines.append('<table>')
                in_table = True
                # Check if header (next line is separator)
                if i + 1 < len(lines) and '---' in lines[i+1]:
                    cells = [c.strip() for c in line.strip('|').split('|')]
                    html_lines.append('<thead><tr>' + ''.join(f'<th>{c}</th>' for c in cells) + '</tr></thead><tbody>')
                    i += 2  # skip separator
                    continue
                else:
                    cells = [c.strip() for c in line.strip('|').split('|')]
                    html_lines.append('<tbody><tr>' + ''.join(f'<td>{_inline(c)}</td>' for c in cells) + '</tr>')
            else:
                cells = [c.strip() for c in line.strip('|').split('|')]
                html_lines.append('<tr>' + ''.join(f'<td>{_inline(c)}</td>' for c in cells) + '</tr>')
            i += 1
            continue
        elif in_table:
            html_lines.append('</tbody></table>')
            in_table = False
        
        # Headings
        if line.startswith('## '):
            html_lines.append(f'<h2>{_inline(line[3:])}</h2>')
        elif line.startswith('### '):
            html_lines.append(f'<h3>{_inline(line[4:])}</h3>')
        elif line.startswith('#### '):
            html_lines.append(f'<h4>{_inline(line[5:])}</h4>')
        elif line.startswith('---'):
            html_lines.append('<hr/>')
        elif line.startswith('> '):
            html_lines.append(f'<blockquote>{_inline(line[2:])}</blockquote>')
        elif re.match(r'^\d+\. ', line):
            # Ordered list item
            stripped = re.sub(r'^\d+\. ', '', line)
            html_lines.append(f'<li>{_inline(stripped)}</li>')
        elif line.startswith('- ') or line.startswith('* '):
            html_lines.append(f'<li>{_inline(line[2:])}</li>')
        elif line.strip() == '':
            html_lines.append('')
        else:
            html_lines.append(f'<p>{_inline(line)}</p>')
        
        i += 1
    
    if in_table:
        html_lines.append('</tbody></table>')
    
    return '\n'.join(html_lines)

def _inline(text):
    # Bold
    text = re.sub(r'\*\*(.+?)\*\*', r'<strong>\1</strong>', text)
    # Italic
    text = re.sub(r'\*(.+?)\*', r'<em>\1</em>', text)
    # Code
    text = re.sub(r'`(.+?)`', r'<code>\1</code>', text)
    # Links
    text = re.sub(r'\[(.+?)\]\((.+?)\)', r'<a href="\2">\1</a>', text)
    return text

body_html = md_to_html(md_text)

html = f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Recipes — The Integrator Toolchain for AI Agents</title>
<style>
  @page {{
    size: A4;
    margin: 2cm 2.5cm;
    @top-right {{ content: "recipes.wisechef.ai"; font-size: 9px; color: #666; }}
    @bottom-center {{ content: counter(page) " / " counter(pages); font-size: 9px; color: #666; }}

  }}
  body {{
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 10.5pt;
    line-height: 1.65;
    color: #1a1a1a;
    max-width: 100%;
  }}
  h1 {{ font-size: 22pt; margin-bottom: 6pt; page-break-after: avoid; color: #111; }}
  h2 {{ font-size: 14pt; margin-top: 18pt; margin-bottom: 6pt; border-bottom: 1px solid #ddd; padding-bottom: 4pt; page-break-after: avoid; }}
  h3 {{ font-size: 11.5pt; margin-top: 12pt; margin-bottom: 4pt; page-break-after: avoid; color: #333; }}
  h4 {{ font-size: 10.5pt; margin-top: 8pt; margin-bottom: 3pt; }}
  p {{ margin: 0 0 8pt 0; orphans: 3; widows: 3; }}
  code {{ font-family: 'Courier New', monospace; font-size: 9pt; background: #f4f4f4; padding: 1px 3px; border-radius: 2px; }}
  pre {{ background: #f4f4f4; padding: 10pt; border-left: 3px solid #888; margin: 10pt 0; overflow: visible; }}
  pre code {{ background: none; padding: 0; font-size: 8.5pt; white-space: pre-wrap; word-break: break-all; }}
  table {{ width: 100%; border-collapse: collapse; margin: 10pt 0; font-size: 9.5pt; }}
  th {{ background: #f0f0f0; text-align: left; padding: 4pt 6pt; border: 1px solid #ccc; font-weight: bold; }}
  td {{ padding: 3pt 6pt; border: 1px solid #ddd; vertical-align: top; }}
  tr:nth-child(even) {{ background: #fafafa; }}
  blockquote {{ border-left: 3px solid #888; margin: 8pt 0 8pt 10pt; padding: 4pt 10pt; color: #555; font-style: italic; }}
  hr {{ border: none; border-top: 1px solid #ccc; margin: 14pt 0; }}
  a {{ color: #444; }}
  li {{ margin-bottom: 3pt; }}
  strong {{ font-weight: bold; }}
  em {{ font-style: italic; }}
  .cover {{
    text-align: center;
    padding-top: 80pt;
    page-break-after: always;
  }}
  .cover h1 {{ font-size: 28pt; margin-bottom: 16pt; }}
  .cover .subtitle {{ font-size: 12pt; color: #555; margin-bottom: 8pt; }}
  .cover .date {{ font-size: 10pt; color: #888; margin-top: 20pt; }}
  .cover .domain {{ font-size: 11pt; color: #444; margin-top: 8pt; }}
</style>
</head>
<body>
<div class="cover">
  <h1>Recipes</h1>
  <div class="subtitle">The Integrator Toolchain for AI Agents</div>
  <div class="subtitle" style="font-size:10.5pt; margin-top: 16pt; max-width: 420pt; margin-left: auto; margin-right: auto;">
    Architecture, trust model, economics, and the compounding cookbook.<br>
    DB-as-truth + optional git feedback beats both pure-marketplace and pure-git.
  </div>
  <div class="date">Published: 2026-06-02 | All claims verified against live system</div>
  <div class="domain">recipes.wisechef.ai</div>
</div>
{body_html}
</body>
</html>"""

out_path = Path(__file__).parent.parent / "public/whitepaper.pdf"
out_path.parent.mkdir(parents=True, exist_ok=True)

from weasyprint import HTML, CSS
print(f"Generating PDF to {out_path}...")
HTML(string=html, base_url=str(md_path.parent)).write_pdf(str(out_path))
size = out_path.stat().st_size
print(f"PDF generated: {out_path} ({size:,} bytes)")
