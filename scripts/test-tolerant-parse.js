// 单测：加载 tts_server.js（注入 http/child_process shim，不真正监听端口），
// 用文件内真实的 repairModelJSON / tolerantParseJSON / parseAIJSON 跑容错用例。
const fs = require('fs');

let src = fs.readFileSync(require('path').join(__dirname, '..', 'tts_server.js'), 'utf8');
src = src
  .replace("const http = require('http');", "const http = { createServer: () => ({ listen: () => {} }) };")
  .replace("const https = require('https');", "const https = {};")
  .replace("const { execFile } = require('child_process');", "const execFile = () => {};");

const mod = new Function('require', '__dirname', src + '\n;return { repairModelJSON, tolerantParseJSON, parseAIJSON };')(require, require('path').join(__dirname, '..'));
const parseAIJSON = mod.parseAIJSON;

const cases = [
  // [名称, 输入, 期望可解析]
  ['标准 JSON', '{"kr":"안녕하세요","full":"你好","breakdown":[],"rules":[1],"tip":"你好","examples":[]}', true],
  ['未转义引号→「」', '{"tip":"韩语中"去某地"用에表示方向"}', true],
  ["JS 式 \\' 转义", "{\"tip\":\"使用'-고 싶어요'表达\"}", true],
  ['缺失逗号(对象间,数组内)', '{"examples":[{"kr":"a","full":"b"}{"kr":"c","full":"d"}]}', true],
  ['缺失逗号(数组元素)', '{"rules":[1 2 3]}', true],
  ['顶层双对象拼接(取最后)', '{"reasoning":"思考过程"}{"kr":"안녕","full":"你好"}', true],
  ['尾逗号', '{"a":1, "b":[1,2,],}', true],
  ['单引号字符串', "{\"tip\":'안녕'}", true],
  ['裸键名', '{kr:"안녕", full:"你好"}', true],
  ['注释', '{\n// 注释\n"a":1 /* 块注释 */}', true],
  ['markdown 代码块', '```json\n{"kr":"안녕"}\n```', true],
  ['口语前缀', '好的，这是你要的：{"kr":"안녕"} 希望对你有帮助', true],
  ['串内裸换行', '{"tip":"第一行\n第二行"}', true],
  ['\\u 转义', '{"kr":"\\uc548\\ub155\\ud558\\uc138\\uc694"}', true],
  ['嵌套对象', '{"kr":"안녕","extra":{"a":1},"b":[{"c":2}]}', true],
  ['空对象', '{}', true],
  ['截断(应失败)', '{"kr":"안녕"', false],
];

let pass = 0, fail = 0;
for (const [name, input, expectOk] of cases) {
  try {
    const v = parseAIJSON(input);
    if (expectOk) { pass++; console.log(`✅ ${name} → ${JSON.stringify(v).slice(0, 80)}`); }
    else { fail++; console.log(`❌ ${name} 期望失败但成功了`); }
  } catch (e) {
    if (!expectOk) { pass++; console.log(`✅ ${name} → 按预期抛错`); }
    else { fail++; console.log(`❌ ${name} → ${e.message}`); }
  }
}
console.log(`\n${pass} PASS / ${fail} FAIL`);
process.exit(fail ? 1 : 0);
