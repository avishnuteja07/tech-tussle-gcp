"use strict";

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const crypto = require("node:crypto");
const { spawn, execSync } = require("node:child_process");
const content = require("./content.json");

const DEFAULT_JUDGE0_LANGUAGE_IDS = { c: 50, cpp: 54, csharp: 51, java: 62, javascript: 63, python: 71 };

// Locate installed local compiler / interpreter binaries across Linux (Render, Railway, Docker) and Windows
function findBinary(names, explicitEnvVar, fallbackCandidates = []) {
  if (explicitEnvVar && process.env[explicitEnvVar]) {
    const custom = process.env[explicitEnvVar].trim();
    if (custom && fs.existsSync(custom)) return custom;
  }
  const nameList = Array.isArray(names) ? names : [names];
  for (const name of nameList) {
    try {
      const cmd = process.platform === "win32"
        ? `where.exe ${name}`
        : `command -v ${name} 2>/dev/null || which ${name} 2>/dev/null`;
      const out = execSync(cmd, { stdio: ["pipe", "pipe", "ignore"], encoding: "utf-8", shell: true });
      const first = out.trim().split(/\r?\n/)[0];
      if (first && fs.existsSync(first)) return first;
    } catch {}
  }
  for (const cand of fallbackCandidates) {
    if (cand && fs.existsSync(cand)) return cand;
  }
  return null;
}

// Discovered toolpaths (cached)
const LOCAL_TOOLS = {
  python: findBinary(["python3", "python"], "PYTHON_PATH", [
    "/usr/bin/python3",
    "/usr/local/bin/python3",
    "/usr/bin/python",
    "/usr/local/bin/python",
    "C:\\msys64\\ucrt64\\bin\\python.exe",
    "C:\\msys64\\mingw64\\bin\\python.exe",
    "C:\\Python312\\python.exe",
    "C:\\Python311\\python.exe",
    "C:\\Python310\\python.exe",
  ]),
  node: process.execPath,
  gcc: findBinary(["gcc"], "GCC_PATH", [
    "/usr/bin/gcc",
    "/usr/local/bin/gcc",
    "C:\\msys64\\ucrt64\\bin\\gcc.exe",
    "C:\\msys64\\mingw64\\bin\\gcc.exe",
    "C:\\MinGW\\bin\\gcc.exe",
  ]),
  gpp: findBinary(["g++"], "GPP_PATH", [
    "/usr/bin/g++",
    "/usr/local/bin/g++",
    "C:\\msys64\\ucrt64\\bin\\g++.exe",
    "C:\\msys64\\mingw64\\bin\\g++.exe",
    "C:\\MinGW\\bin\\g++.exe",
  ]),
  csc: findBinary(["csc", "mcs"], "CSC_PATH", [
    "/usr/bin/csc",
    "/usr/bin/mcs",
    "/usr/local/bin/mcs",
    "/usr/lib/mono/4.5/mcs.exe",
    "C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe",
    "C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe",
  ]),
  mono: findBinary(["mono"], "MONO_PATH", [
    "/usr/bin/mono",
    "/usr/local/bin/mono",
  ]),
  javac: findBinary(["javac"], "JAVAC_PATH", [
    process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, "bin", process.platform === "win32" ? "javac.exe" : "javac") : null,
    "/usr/bin/javac",
    "/usr/lib/jvm/default-java/bin/javac",
    "/usr/lib/jvm/java-17-openjdk-amd64/bin/javac",
    "/usr/lib/jvm/java-17-openjdk/bin/javac",
    "/usr/lib/jvm/java-21-openjdk-amd64/bin/javac",
    "/usr/lib/jvm/java-11-openjdk-amd64/bin/javac",
    "C:\\Program Files\\JetBrains\\PyCharm 2026.2.1\\jbr\\bin\\javac.exe",
  ]),
  java: findBinary(["java"], "JAVA_PATH", [
    process.env.JAVA_HOME ? path.join(process.env.JAVA_HOME, "bin", process.platform === "win32" ? "java.exe" : "java") : null,
    "/usr/bin/java",
    "/usr/lib/jvm/default-java/bin/java",
    "/usr/lib/jvm/java-17-openjdk-amd64/bin/java",
    "/usr/lib/jvm/java-17-openjdk/bin/java",
    "/usr/lib/jvm/java-21-openjdk-amd64/bin/java",
    "/usr/lib/jvm/java-11-openjdk-amd64/bin/java",
    "C:\\Program Files\\JetBrains\\PyCharm 2026.2.1\\jbr\\bin\\java.exe",
  ]),
};

console.log("[Level3 Runner] Discovered local tools:", {
  python: LOCAL_TOOLS.python ? path.basename(LOCAL_TOOLS.python) : null,
  node: LOCAL_TOOLS.node ? path.basename(LOCAL_TOOLS.node) : null,
  gcc: LOCAL_TOOLS.gcc ? path.basename(LOCAL_TOOLS.gcc) : null,
  gpp: LOCAL_TOOLS.gpp ? path.basename(LOCAL_TOOLS.gpp) : null,
  csc: LOCAL_TOOLS.csc ? path.basename(LOCAL_TOOLS.csc) : null,
  mono: LOCAL_TOOLS.mono ? path.basename(LOCAL_TOOLS.mono) : null,
  javac: LOCAL_TOOLS.javac ? path.basename(LOCAL_TOOLS.javac) : null,
  java: LOCAL_TOOLS.java ? path.basename(LOCAL_TOOLS.java) : null,
});

function getDisableLocalLanguages() {
  const envVal = process.env.DISABLE_LOCAL_LANGUAGES || "";
  return envVal
    .toLowerCase()
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function getPreferRemoteLanguages() {
  const envVal = process.env.PREFER_REMOTE_LANGUAGES || "";
  return envVal
    .toLowerCase()
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function getLanguagePreferences(language) {
  const lang = String(language || "").toLowerCase();
  const disabledLocal = getDisableLocalLanguages();
  if (disabledLocal.includes(lang)) {
    return ["remote"];
  }
  const preferredRemote = getPreferRemoteLanguages();
  if (preferredRemote.includes(lang)) {
    return ["remote", "local"];
  }
  const defaultRaw = (process.env.RUNNER_PREFERENCE || "local,remote")
    .toLowerCase()
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return defaultRaw.length ? defaultRaw : ["local", "remote"];
}

function getLocalSupportedLanguages() {
  const disabled = getDisableLocalLanguages();
  const list = [];
  if (LOCAL_TOOLS.python && !disabled.includes("python")) list.push("python");
  if (LOCAL_TOOLS.node && !disabled.includes("javascript")) list.push("javascript");
  if (LOCAL_TOOLS.gcc && !disabled.includes("c")) list.push("c");
  if (LOCAL_TOOLS.gpp && !disabled.includes("cpp")) list.push("cpp");
  if (LOCAL_TOOLS.csc && (process.platform === "win32" || LOCAL_TOOLS.mono) && !disabled.includes("csharp")) list.push("csharp");
  if (LOCAL_TOOLS.javac && LOCAL_TOOLS.java && !disabled.includes("java")) list.push("java");
  return list;
}

function judgeLanguageIds() {
  try {
    return { ...DEFAULT_JUDGE0_LANGUAGE_IDS, ...JSON.parse(process.env.JUDGE0_LANGUAGE_IDS || "{}") };
  } catch {
    return DEFAULT_JUDGE0_LANGUAGE_IDS;
  }
}

function normalizeLines(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/, ""))
    .join("\n")
    .replace(/\n+$/, "");
}

function level3OutputPasses(question, test, stdout) {
  const actual = normalizeLines(stdout);
  const expected = normalizeLines(test.expected);
  if (question.checker === "exact-output") return actual === expected;
  const values = actual.match(/-?\d+/g)?.map(Number) || [];
  if (question.checker === "single-integer") return values.length === 1 && values[0] === Number(expected.trim());
  if (question.checker === "integer-array") {
    const expectedValues = expected.match(/-?\d+/g)?.map(Number) || [];
    return values.length === expectedValues.length && values.every((value, index) => value === expectedValues[index]);
  }
  if (question.checker === "integer-set") {
    const expectedValues = expected.match(/-?\d+/g)?.map(Number) || [];
    return (
      values.length === expectedValues.length &&
      [...values].sort((a, b) => a - b).every((value, index) => value === [...expectedValues].sort((a, b) => a - b)[index])
    );
  }
  if (question.checker === "beautiful-array") {
    const size = Number(test.input.trim());
    if (values.length !== size || new Set(values).size !== size || values.some((value) => value < 1 || value > size)) {
      return false;
    }
    const positions = new Array(size + 1);
    values.forEach((value, index) => {
      positions[value] = index;
    });
    for (let low = 1; low <= size; low += 1) {
      for (let high = low + 1; high <= size; high += 1) {
        const middle = (low + high) / 2;
        if (
          Number.isInteger(middle) &&
          positions[middle] > Math.min(positions[low], positions[high]) &&
          positions[middle] < Math.max(positions[low], positions[high])
        ) {
          return false;
        }
      }
    }
    return true;
  }
  if (question.checker === "longest-palindrome") {
    const input = test.input.trim();
    const result = actual.trim().replace(/^['\"]|['\"]$/g, "");
    if (!result || !input.includes(result) || result !== [...result].reverse().join("")) return false;
    let longest = 0;
    for (let center = 0; center < input.length; center += 1) {
      for (const offset of [0, 1]) {
        let left = center;
        let right = center + offset;
        while (left >= 0 && right < input.length && input[left] === input[right]) {
          longest = Math.max(longest, right - left + 1);
          left -= 1;
          right += 1;
        }
      }
    }
    return result.length === longest;
  }
  return false;
}

function buildLevel3FunctionProgram(questionId, language, source, inputs) {
  if (language === "python" && content.level3Questions.find((q) => q.id === questionId)?.starterCode?.python) {
    const adapters = {
      "rotate-array": `data = list(map(int, raw.split()))\n    n, k = data[0], data[1]\n    return " ".join(map(str, rotate_array(data[2:2+n], k)))`,
      "good-pairs": `has_bracket = "[" in raw\n    raw_clean = raw.replace("[", " ").replace("]", " ").replace(",", " ")\n    data = list(map(int, raw_clean.split()))\n    nums = data if has_bracket else (data[1:] if (len(data) > 1 and data[0] == len(data) - 1) else data)\n    return str(num_identical_pairs(nums))`,
      "beautiful-array": `has_bracket = "[" in raw\n    raw_clean = raw.replace("[", " ").replace("]", " ").replace(",", " ")\n    data = list(map(int, raw_clean.split()))\n    nums = data if has_bracket else (data[1:] if (len(data) > 1 and data[0] == len(data) - 1) else data)\n    return str(num_identical_pairs(nums))`,
      "longest-palindrome": `return str(longest_palindrome(raw.rstrip("\\r\\n")))`,
      "vertical-words": `return "\\n".join(print_vertically(raw.rstrip("\\r\\n")))`,
      "ice-cream-bars": `data = list(map(int, raw.split()))\n    n, coins = data[0], data[1]\n    return str(max_ice_cream(data[2:2+n], coins))`,
      "duplicate-zeros": `data = list(map(int, raw.split()))\n    nums = data[1:]\n    result = duplicate_zeros(nums)\n    return " ".join(map(str, nums if result is None else result))`,
      "sort-even-odd-indices": `data = list(map(int, raw.split()))\n    n = data[0]\n    return " ".join(map(str, sort_even_odd(data[1:1+n])))`,
      "lucky-numbers-matrix": `data = list(map(int, raw.split()))\n    m, n = data[0], data[1]\n    values = data[2:]\n    matrix = [values[row*n:(row+1)*n] for row in range(m)]\n    return " ".join(map(str, lucky_numbers(matrix)))`,
    };
    const adapter = adapters[questionId];
    if (!adapter) throw new Error("No function runner is configured for this question.");
    const encodedInputs = Buffer.from(JSON.stringify(inputs)).toString("base64");
    const indentedAdapter = adapter
      .split("\n")
      .map((line) => `    ${line.trimStart()}`)
      .join("\n");
    return `${source}\n\nimport base64 as __b64\nimport json as __json\n__inputs = __json.loads(__b64.b64decode("${encodedInputs}").decode("utf-8"))\ndef __solve(raw):\n${indentedAdapter}\n__results = []\nfor __raw in __inputs:\n    try:\n        __results.append({"ok": True, "output": __solve(__raw)})\n    except Exception as __error:\n        __results.append({"ok": False, "error": str(__error)})\nprint(__json.dumps(__results, ensure_ascii=False))\n`;
  }
  if (language === "javascript" && content.level3Questions.find((q) => q.id === questionId)?.starterCode?.javascript) {
    const adapters = {
      "rotate-array": `const data=raw.trim().split(/\\s+/).map(Number), n=data[0], k=data[1]; return rotateArray(data.slice(2,2+n),k).join(" ");`,
      "good-pairs": `const hasBracket=raw.includes("["); const tokens=raw.replace(/[\\[\\],]/g, " ").trim().split(/\\s+/).map(Number).filter(v=>!isNaN(v)); const nums=hasBracket?tokens:(tokens.length>1 && tokens[0]===tokens.length-1?tokens.slice(1):tokens); return String(numIdenticalPairs(nums));`,
      "beautiful-array": `const hasBracket=raw.includes("["); const tokens=raw.replace(/[\\[\\],]/g, " ").trim().split(/\\s+/).map(Number).filter(v=>!isNaN(v)); const nums=hasBracket?tokens:(tokens.length>1 && tokens[0]===tokens.length-1?tokens.slice(1):tokens); return typeof numIdenticalPairs==="function"?String(numIdenticalPairs(nums)):beautifulArray(Number(raw.trim())).join(" ");`,
      "longest-palindrome": `return String(longestPalindrome(raw.replace(/\\r?\\n$/, "")));`,
      "vertical-words": `return printVertically(raw.replace(/\\r?\\n$/, "")).join("\\n");`,
      "ice-cream-bars": `const data=raw.trim().split(/\\s+/).map(Number), n=data[0], coins=data[1]; return String(maxIceCream(data.slice(2,2+n),coins));`,
      "duplicate-zeros": `const data=raw.trim().split(/\\s+/).map(Number), nums=data.slice(1), result=duplicateZeros(nums); return (result !== undefined && result !== null ? result : nums).join(" ");`,
      "sort-even-odd-indices": `const data=raw.trim().split(/\\s+/).map(Number), n=data[0]; return sortEvenOdd(data.slice(1,1+n)).join(" ");`,
      "lucky-numbers-matrix": `const data=raw.trim().split(/\\s+/).map(Number), m=data[0], n=data[1], values=data.slice(2), matrix=Array.from({length:m},(_,r)=>values.slice(r*n,(r+1)*n)); return luckyNumbers(matrix).join(" ");`,
    };
    const adapter = adapters[questionId];
    if (!adapter) throw new Error("No JavaScript function runner is configured for this question.");
    return `${source}\n\nconst __inputs = ${JSON.stringify(inputs)};\nconst __solve = (raw) => { ${adapter} };\nconst __results = __inputs.map((raw) => { try { return { ok: true, output: String(__solve(raw)) }; } catch (error) { return { ok: false, error: String(error) }; } });\nconsole.log(JSON.stringify(__results));\n`;
  }
  if (language === "cpp" && content.level3Questions.find((q) => q.id === questionId)?.starterCode?.cpp) {
    const adapters = {
      "rotate-array": `std::stringstream ss(__inputs[__idx]); int n, k; ss >> n >> k; std::vector<int> nums(n); for(int i=0; i<n; i++) ss >> nums[i]; std::vector<int> ans = rotateArray(nums, k); const auto& target = ans.empty() ? nums : ans; std::ostringstream out; for(size_t i=0; i<target.size(); i++) { if(i>0) out << " "; out << target[i]; } __print_json_output(out.str());`,
      "good-pairs": `bool hasBracket = (__inputs[__idx].find('[') != std::string::npos); std::string clean = __inputs[__idx]; for(char& c : clean) { if(c=='['||c==']'||c==',') c = ' '; } std::stringstream ss(clean); std::vector<int> tokens; int v; while(ss >> v) tokens.push_back(v); std::vector<int> nums = (!hasBracket && tokens.size() > 1 && tokens[0] == (int)tokens.size() - 1) ? std::vector<int>(tokens.begin() + 1, tokens.end()) : tokens; int ans = numIdenticalPairs(nums); __print_json_output(std::to_string(ans));`,
      "beautiful-array": `bool hasBracket = (__inputs[__idx].find('[') != std::string::npos); std::string clean = __inputs[__idx]; for(char& c : clean) { if(c=='['||c==']'||c==',') c = ' '; } std::stringstream ss(clean); std::vector<int> tokens; int v; while(ss >> v) tokens.push_back(v); std::vector<int> nums = (!hasBracket && tokens.size() > 1 && tokens[0] == (int)tokens.size() - 1) ? std::vector<int>(tokens.begin() + 1, tokens.end()) : tokens; int ans = numIdenticalPairs(nums); __print_json_output(std::to_string(ans));`,
      "longest-palindrome": `std::string s = __inputs[__idx]; while(!s.empty() && (s.back()=='\\r' || s.back()=='\\n')) s.pop_back(); std::string ans = longestPalindrome(s); __print_json_output(ans);`,
      "vertical-words": `std::string s = __inputs[__idx]; while(!s.empty() && (s.back()=='\\r' || s.back()=='\\n')) s.pop_back(); std::vector<std::string> ans = printVertically(s); std::ostringstream out; for(size_t i=0; i<ans.size(); i++) { if(i>0) out << "\\n"; out << ans[i]; } __print_json_output(out.str());`,
      "ice-cream-bars": `std::stringstream ss(__inputs[__idx]); int n, coins; ss >> n >> coins; std::vector<int> costs(n); for(int i=0; i<n; i++) ss >> costs[i]; int ans = maxIceCream(costs, coins); __print_json_output(std::to_string(ans));`,
      "duplicate-zeros": `std::stringstream ss(__inputs[__idx]); int n; ss >> n; std::vector<int> arr(n); for(int i=0; i<n; i++) ss >> arr[i]; duplicateZeros(arr); std::ostringstream out; for(size_t i=0; i<arr.size(); i++) { if(i>0) out << " "; out << arr[i]; } __print_json_output(out.str());`,
      "sort-even-odd-indices": `std::stringstream ss(__inputs[__idx]); int n; ss >> n; std::vector<int> nums(n); for(int i=0; i<n; i++) ss >> nums[i]; std::vector<int> ans = sortEvenOdd(nums); const auto& target = ans.empty() ? nums : ans; std::ostringstream out; for(size_t i=0; i<target.size(); i++) { if(i>0) out << " "; out << target[i]; } __print_json_output(out.str());`,
      "lucky-numbers-matrix": `std::stringstream ss(__inputs[__idx]); int m, n; ss >> m >> n; std::vector<std::vector<int>> matrix(m, std::vector<int>(n)); for(int i=0; i<m; i++) for(int j=0; j<n; j++) ss >> matrix[i][j]; std::vector<int> ans = luckyNumbers(matrix); std::ostringstream out; for(size_t i=0; i<ans.size(); i++) { if(i>0) out << " "; out << ans[i]; } __print_json_output(out.str());`,
    };
    const adapter = adapters[questionId];
    if (!adapter) throw new Error("No C++ function runner is configured for this question.");
    return `#include <iostream>
#include <sstream>
#include <vector>
#include <string>
#include <algorithm>

void __print_json_output(const std::string& str) {
    std::cout << "{\\"ok\\":true,\\"output\\":\\"";
    for (char c : str) {
        if (c == '"') std::cout << "\\\\\\\"";
        else if (c == '\\\\') std::cout << "\\\\\\\\";
        else if (c == '\\n') std::cout << "\\\\n";
        else if (c == '\\r') std::cout << "\\\\r";
        else if (c == '\\t') std::cout << "\\\\t";
        else std::cout << c;
    }
    std::cout << "\\"}\";
}

${source}

int main() {
    std::vector<std::string> __inputs = {
        ${inputs.map((inp) => JSON.stringify(inp)).join(",\n        ")}
    };
    std::cout << "[";
    for (size_t __idx = 0; __idx < __inputs.size(); __idx++) {
        if (__idx > 0) std::cout << ",";
        try {
            ${adapter}
        } catch (...) {
            std::cout << "{\\"ok\\":false,\\"error\\":\\"Runtime error\\"}";
        }
    }
    std::cout << "]" << std::endl;
    return 0;
}
`;
  }
  if (language === "java" && content.level3Questions.find((q) => q.id === questionId)?.starterCode?.java) {
    const adapters = {
      "rotate-array": `Scanner sc = new Scanner(__inputs[__idx]); int n = sc.nextInt(), k = sc.nextInt(); int[] nums = new int[n]; for(int i=0; i<n; i++) nums[i] = sc.nextInt(); int[] ans = sol.rotateArray(nums, k); int[] target = ans != null ? ans : nums; StringBuilder out = new StringBuilder(); for(int i=0; i<target.length; i++) { if(i>0) out.append(" "); out.append(target[i]); } __printJsonOutput(out.toString());`,
      "good-pairs": `boolean hasBracket = __inputs[__idx].contains("["); String clean = __inputs[__idx].replace("[", " ").replace("]", " ").replace(",", " "); Scanner sc = new Scanner(clean); List<Integer> tokens = new ArrayList<>(); while(sc.hasNextInt()) tokens.add(sc.nextInt()); int[] nums; if(!hasBracket && tokens.size() > 1 && tokens.get(0) == tokens.size() - 1) { nums = new int[tokens.size() - 1]; for(int i=1; i<tokens.size(); i++) nums[i-1] = tokens.get(i); } else { nums = new int[tokens.size()]; for(int i=0; i<tokens.size(); i++) nums[i] = tokens.get(i); } int ans = sol.numIdenticalPairs(nums); __printJsonOutput(String.valueOf(ans));`,
      "beautiful-array": `boolean hasBracket = __inputs[__idx].contains("["); String clean = __inputs[__idx].replace("[", " ").replace("]", " ").replace(",", " "); Scanner sc = new Scanner(clean); List<Integer> tokens = new ArrayList<>(); while(sc.hasNextInt()) tokens.add(sc.nextInt()); int[] nums; if(!hasBracket && tokens.size() > 1 && tokens.get(0) == tokens.size() - 1) { nums = new int[tokens.size() - 1]; for(int i=1; i<tokens.size(); i++) nums[i-1] = tokens.get(i); } else { nums = new int[tokens.size()]; for(int i=0; i<tokens.size(); i++) nums[i] = tokens.get(i); } int ans = sol.numIdenticalPairs(nums); __printJsonOutput(String.valueOf(ans));`,
      "longest-palindrome": `String s = __inputs[__idx].replaceAll("[\\\\r\\\\n]+$", ""); String ans = sol.longestPalindrome(s); __printJsonOutput(ans != null ? ans : "");`,
      "vertical-words": `String s = __inputs[__idx].replaceAll("[\\\\r\\\\n]+$", ""); List<String> ans = sol.printVertically(s); StringBuilder out = new StringBuilder(); for(int i=0; i<ans.size(); i++) { if(i>0) out.append("\\n"); out.append(ans.get(i)); } __printJsonOutput(out.toString());`,
      "ice-cream-bars": `Scanner sc = new Scanner(__inputs[__idx]); int n = sc.nextInt(), coins = sc.nextInt(); int[] costs = new int[n]; for(int i=0; i<n; i++) costs[i] = sc.nextInt(); int ans = sol.maxIceCream(costs, coins); __printJsonOutput(String.valueOf(ans));`,
      "duplicate-zeros": `Scanner sc = new Scanner(__inputs[__idx]); int n = sc.nextInt(); int[] nums = new int[n]; for(int i=0; i<n; i++) nums[i] = sc.nextInt(); sol.duplicateZeros(nums); StringBuilder out = new StringBuilder(); for(int i=0; i<nums.length; i++) { if(i>0) out.append(" "); out.append(nums[i]); } __printJsonOutput(out.toString());`,
      "sort-even-odd-indices": `Scanner sc = new Scanner(__inputs[__idx]); int n = sc.nextInt(); int[] nums = new int[n]; for(int i=0; i<n; i++) nums[i] = sc.nextInt(); int[] ans = sol.sortEvenOdd(nums); int[] target = ans != null ? ans : nums; StringBuilder out = new StringBuilder(); for(int i=0; i<target.length; i++) { if(i>0) out.append(" "); out.append(target[i]); } __printJsonOutput(out.toString());`,
      "lucky-numbers-matrix": `Scanner sc = new Scanner(__inputs[__idx]); int m = sc.nextInt(), n = sc.nextInt(); int[][] matrix = new int[m][n]; for(int i=0; i<m; i++) for(int j=0; j<n; j++) matrix[i][j] = sc.nextInt(); List<Integer> ans = sol.luckyNumbers(matrix); StringBuilder out = new StringBuilder(); for(int i=0; i<ans.size(); i++) { if(i>0) out.append(" "); out.append(ans.get(i)); } __printJsonOutput(out.toString());`,
    };
    const adapter = adapters[questionId];
    if (!adapter) throw new Error("No Java function runner is configured for this question.");
    const cleanSource = source.replace(/public\s+class\s+Solution/, "class Solution");
    return `import java.util.*;

${cleanSource}

public class Main {
    static void __printJsonOutput(String str) {
        StringBuilder sb = new StringBuilder("{\\"ok\\":true,\\"output\\":\\"");
        for (int i = 0; i < str.length(); i++) {
            char c = str.charAt(i);
            if (c == '"') sb.append("\\\\\\\"");
            else if (c == '\\\\') sb.append("\\\\\\\\");
            else if (c == '\\n') sb.append("\\\\n");
            else if (c == '\\r') sb.append("\\\\r");
            else if (c == '\\t') sb.append("\\\\t");
            else sb.append(c);
        }
        sb.append("\\\"}");
        System.out.print(sb.toString());
    }

    public static void main(String[] args) {
        Solution sol = new Solution();
        String[] __inputs = new String[] {
            ${inputs.map((inp) => JSON.stringify(inp)).join(",\n            ")}
        };
        System.out.print("[");
        for (int __idx = 0; __idx < __inputs.length; __idx++) {
            if (__idx > 0) System.out.print(",");
            try {
                ${adapter}
            } catch (Throwable __t) {
                System.out.print("{\\"ok\\":false,\\"error\\":\\"Runtime error\\"}");
            }
        }
        System.out.println("]");
    }
}
`;
  }
  if (language === "csharp" && content.level3Questions.find((q) => q.id === questionId)?.starterCode?.csharp) {
    const adapters = {
      "rotate-array": `var tokens = __inputs[__idx].Trim().Split(new[]{' ', '\\n', '\\r'}, StringSplitOptions.RemoveEmptyEntries); int n = int.Parse(tokens[0]), k = int.Parse(tokens[1]); int[] nums = new int[n]; for(int i=0; i<n; i++) nums[i] = int.Parse(tokens[2+i]); int[] ans = sol.RotateArray(nums, k); int[] target = ans ?? nums; PrintJsonOutput(string.Join(" ", target));`,
      "good-pairs": `bool hasBracket = __inputs[__idx].Contains("["); var clean = __inputs[__idx].Replace("[", " ").Replace("]", " ").Replace(",", " "); var tokens = clean.Trim().Split(new[]{' ', '\\n', '\\r'}, StringSplitOptions.RemoveEmptyEntries).Select(int.Parse).ToArray(); int[] nums = (!hasBracket && tokens.Length > 1 && tokens[0] == tokens.Length - 1) ? tokens.Skip(1).ToArray() : tokens; int ans = sol.NumIdenticalPairs(nums); PrintJsonOutput(ans.ToString());`,
      "beautiful-array": `bool hasBracket = __inputs[__idx].Contains("["); var clean = __inputs[__idx].Replace("[", " ").Replace("]", " ").Replace(",", " "); var tokens = clean.Trim().Split(new[]{' ', '\\n', '\\r'}, StringSplitOptions.RemoveEmptyEntries).Select(int.Parse).ToArray(); int[] nums = (!hasBracket && tokens.Length > 1 && tokens[0] == tokens.Length - 1) ? tokens.Skip(1).ToArray() : tokens; int ans = sol.NumIdenticalPairs(nums); PrintJsonOutput(ans.ToString());`,
      "longest-palindrome": `string s = __inputs[__idx].TrimEnd('\\r', '\\n'); string ans = sol.LongestPalindrome(s); PrintJsonOutput(ans ?? "");`,
      "vertical-words": `string s = __inputs[__idx].TrimEnd('\\r', '\\n'); var ans = sol.PrintVertically(s); PrintJsonOutput(string.Join("\\n", ans));`,
      "ice-cream-bars": `var tokens = __inputs[__idx].Trim().Split(new[]{' ', '\\n', '\\r'}, StringSplitOptions.RemoveEmptyEntries); int n = int.Parse(tokens[0]), coins = int.Parse(tokens[1]); int[] costs = new int[n]; for(int i=0; i<n; i++) costs[i] = int.Parse(tokens[2+i]); int ans = sol.MaxIceCream(costs, coins); PrintJsonOutput(ans.ToString());`,
      "duplicate-zeros": `var tokens = __inputs[__idx].Trim().Split(new[]{' ', '\\n', '\\r'}, StringSplitOptions.RemoveEmptyEntries); int n = int.Parse(tokens[0]); int[] nums = new int[n]; for(int i=0; i<n; i++) nums[i] = int.Parse(tokens[1+i]); sol.DuplicateZeros(nums); PrintJsonOutput(string.Join(" ", nums));`,
      "sort-even-odd-indices": `var tokens = __inputs[__idx].Trim().Split(new[]{' ', '\\n', '\\r'}, StringSplitOptions.RemoveEmptyEntries); int n = int.Parse(tokens[0]); int[] nums = new int[n]; for(int i=0; i<n; i++) nums[i] = int.Parse(tokens[1+i]); int[] ans = sol.SortEvenOdd(nums); int[] target = ans ?? nums; PrintJsonOutput(string.Join(" ", target));`,
      "lucky-numbers-matrix": `var tokens = __inputs[__idx].Trim().Split(new[]{' ', '\\n', '\\r'}, StringSplitOptions.RemoveEmptyEntries); int m = int.Parse(tokens[0]), n = int.Parse(tokens[1]); int[][] matrix = new int[m][]; int t = 2; for(int i=0; i<m; i++) { matrix[i] = new int[n]; for(int j=0; j<n; j++) matrix[i][j] = int.Parse(tokens[t++]); } var ans = sol.LuckyNumbers(matrix); PrintJsonOutput(string.Join(" ", ans));`,
    };
    const adapter = adapters[questionId];
    if (!adapter) throw new Error("No C# function runner is configured for this question.");
    const cleanSource = source.replace(/public\s+class\s+Solution/, "class Solution");
    return `using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;

${cleanSource}

public class Program {
    static void PrintJsonOutput(string str) {
        var sb = new StringBuilder("{\\"ok\\":true,\\"output\\":\\"");
        foreach (char c in str) {
            if (c == '"') sb.Append("\\\\\\\"");
            else if (c == '\\\\') sb.Append("\\\\\\\\");
            else if (c == '\\n') sb.Append("\\\\n");
            else if (c == '\\r') sb.Append("\\\\r");
            else if (c == '\\t') sb.Append("\\\\t");
            else sb.Append(c);
        }
        sb.Append("\\\"}");
        Console.Write(sb.ToString());
    }

    public static void Main() {
        Solution sol = new Solution();
        string[] __inputs = new string[] {
            ${inputs.map((inp) => JSON.stringify(inp)).join(",\n            ")}
        };
        Console.Write("[");
        for (int __idx = 0; __idx < __inputs.Length; __idx++) {
            if (__idx > 0) Console.Write(",");
            try {
                ${adapter}
            } catch (Exception __ex) {
                Console.Write("{\\"ok\\":false,\\"error\\":\\"Runtime error\\"}");
            }
        }
        Console.WriteLine("]");
    }
}
`;
  }
  if (language === "c" && content.level3Questions.find((q) => q.id === questionId)?.starterCode?.c) {
    const adapters = {
      "rotate-array": `int n = 0, k = 0; const char* p = __inputs[__idx]; if (sscanf(p, "%d %d", &n, &k) == 2) { const char* nl = strchr(p, '\\n'); if (nl) p = nl + 1; int* nums = (int*)malloc(n * sizeof(int)); for (int i = 0; i < n; i++) { int v = 0, rd = 0; sscanf(p, "%d%n", &v, &rd); nums[i] = v; p += rd; } rotateArray(nums, n, k); printf("{\\"ok\\":true,\\"output\\":\\""); for (int i = 0; i < n; i++) { if (i > 0) printf(" "); printf("%d", nums[i]); } printf("\\"}"); free(nums); } else { printf("{\\"ok\\":false,\\"error\\":\\"Input error\\"}"); }`,
      "good-pairs": `int hasBracket = (strchr(__inputs[__idx], '[') != NULL); char clean[4096]; strncpy(clean, __inputs[__idx], sizeof(clean)-1); clean[sizeof(clean)-1] = '\\0'; for(int i=0; clean[i]; i++) { if(clean[i]=='['||clean[i]==']'||clean[i]==',') clean[i] = ' '; } const char* p = clean; int* tokens = (int*)malloc(2000 * sizeof(int)); int count = 0, val = 0, rd = 0; while(sscanf(p, "%d%n", &val, &rd) >= 1) { tokens[count++] = val; p += rd; } int* nums = tokens; int numsSize = count; if(!hasBracket && count > 1 && tokens[0] == count - 1) { nums = tokens + 1; numsSize = count - 1; } int ans = numIdenticalPairs(nums, numsSize); printf("{\\"ok\\":true,\\"output\\":\\"%d\\"}", ans); free(tokens);`,
      "beautiful-array": `int hasBracket = (strchr(__inputs[__idx], '[') != NULL); char clean[4096]; strncpy(clean, __inputs[__idx], sizeof(clean)-1); clean[sizeof(clean)-1] = '\\0'; for(int i=0; clean[i]; i++) { if(clean[i]=='['||clean[i]==']'||clean[i]==',') clean[i] = ' '; } const char* p = clean; int* tokens = (int*)malloc(2000 * sizeof(int)); int count = 0, val = 0, rd = 0; while(sscanf(p, "%d%n", &val, &rd) >= 1) { tokens[count++] = val; p += rd; } int* nums = tokens; int numsSize = count; if(!hasBracket && count > 1 && tokens[0] == count - 1) { nums = tokens + 1; numsSize = count - 1; } int ans = numIdenticalPairs(nums, numsSize); printf("{\\"ok\\":true,\\"output\\":\\"%d\\"}", ans); free(tokens);`,
      "longest-palindrome": `char buf[4096]; strncpy(buf, __inputs[__idx], sizeof(buf) - 1); buf[sizeof(buf) - 1] = '\\0'; char* nl = strpbrk(buf, "\\r\\n"); if (nl) *nl = '\\0'; char* ans = longestPalindrome(buf); __print_json_output(ans ? ans : "");`,
      "vertical-words": `char buf[4096]; strncpy(buf, __inputs[__idx], sizeof(buf) - 1); buf[sizeof(buf) - 1] = '\\0'; char* nl = strpbrk(buf, "\\r\\n"); if (nl) *nl = '\\0'; int returnSize = 0; char** ans = printVertically(buf, &returnSize); printf("{\\"ok\\":true,\\"output\\":\\""); for (int i = 0; i < returnSize; i++) { if (i > 0) printf("\\\\n"); const char* s = ans[i]; while (*s) { if (*s == '"') printf("\\\\\\\""); else if (*s == '\\\\') printf("\\\\\\\\"); else putchar(*s); s++; } } printf("\\"}");`,
      "ice-cream-bars": `int n = 0, coins = 0; const char* p = __inputs[__idx]; if (sscanf(p, "%d %d", &n, &coins) == 2) { const char* nl = strchr(p, '\\n'); if (nl) p = nl + 1; int* costs = (int*)malloc(n * sizeof(int)); for (int i = 0; i < n; i++) { int v = 0, rd = 0; sscanf(p, "%d%n", &v, &rd); costs[i] = v; p += rd; } int ans = maxIceCream(costs, n, coins); printf("{\\"ok\\":true,\\"output\\":\\"%d\\"}", ans); free(costs); } else { printf("{\\"ok\\":false,\\"error\\":\\"Input error\\"}"); }`,
      "duplicate-zeros": `int n = 0; const char* p = __inputs[__idx]; if (sscanf(p, "%d", &n) == 1) { const char* nl = strchr(p, '\\n'); if (nl) p = nl + 1; int* nums = (int*)malloc(n * sizeof(int)); for (int i = 0; i < n; i++) { int v = 0, rd = 0; sscanf(p, "%d%n", &v, &rd); nums[i] = v; p += rd; } duplicateZeros(nums, n); printf("{\\"ok\\":true,\\"output\\":\\""); for (int i = 0; i < n; i++) { if (i > 0) printf(" "); printf("%d", nums[i]); } printf("\\"}"); free(nums); } else { printf("{\\"ok\\":false,\\"error\\":\\"Input error\\"}"); }`,
      "sort-even-odd-indices": `int n = 0; const char* p = __inputs[__idx]; if (sscanf(p, "%d", &n) == 1) { const char* nl = strchr(p, '\\n'); if (nl) p = nl + 1; int* nums = (int*)malloc(n * sizeof(int)); for (int i = 0; i < n; i++) { int v = 0, rd = 0; sscanf(p, "%d%n", &v, &rd); nums[i] = v; p += rd; } sortEvenOdd(nums, n); printf("{\\"ok\\":true,\\"output\\":\\""); for (int i = 0; i < n; i++) { if (i > 0) printf(" "); printf("%d", nums[i]); } printf("\\"}"); free(nums); } else { printf("{\\"ok\\":false,\\"error\\":\\"Input error\\"}"); }`,
      "lucky-numbers-matrix": `int m = 0, n = 0; const char* p = __inputs[__idx]; if (sscanf(p, "%d %d", &m, &n) == 2) { const char* nl = strchr(p, '\\n'); if (nl) p = nl + 1; int** matrix = (int**)malloc(m * sizeof(int*)); int* colSizes = (int*)malloc(m * sizeof(int)); for (int i = 0; i < m; i++) { matrix[i] = (int*)malloc(n * sizeof(int)); colSizes[i] = n; for (int j = 0; j < n; j++) { int v = 0, rd = 0; sscanf(p, "%d%n", &v, &rd); matrix[i][j] = v; p += rd; } } int returnSize = 0; int* ans = luckyNumbers(matrix, m, colSizes, &returnSize); printf("{\\"ok\\":true,\\"output\\":\\""); for (int i = 0; i < returnSize; i++) { if (i > 0) printf(" "); printf("%d", ans[i]); } printf("\\"}"); if (ans) free(ans); for (int i = 0; i < m; i++) free(matrix[i]); free(matrix); free(colSizes); } else { printf("{\\"ok\\":false,\\"error\\":\\"Input error\\"}"); }`,
    };
    const adapter = adapters[questionId];
    if (!adapter) throw new Error("No C function runner is configured for this question.");
    return `#include <stdio.h>
#include <stdlib.h>
#include <string.h>

void __print_json_output(const char* str) {
    printf("{\\"ok\\":true,\\"output\\":\\"");
    while (*str) {
        if (*str == '"') printf("\\\\\\\"");
        else if (*str == '\\\\') printf("\\\\\\\\");
        else if (*str == '\\n') printf("\\\\n");
        else if (*str == '\\r') printf("\\\\r");
        else if (*str == '\\t') printf("\\\\t");
        else putchar(*str);
        str++;
    }
    printf("\\\"}");
}

${source}

int main() {
    const char* __inputs[] = {
        ${inputs.map((inp) => JSON.stringify(inp)).join(",\n        ")}
    };
    int __total = sizeof(__inputs) / sizeof(__inputs[0]);
    printf("[");
    for (int __idx = 0; __idx < __total; __idx++) {
        if (__idx > 0) printf(",");
        ${adapter}
    }
    printf("]\\n");
    return 0;
}
`;
  }
  throw new Error("Function mode is not available for this language. Choose a function starter language or write a complete program.");
}

/**
 * Spawns a process with strict timeout, buffer limits, and stdin input.
 */
function spawnProcess(cmd, args, options = {}) {
  const { input = "", timeout = 2500, cwd, maxBuffer = 131072 } = options;
  return new Promise((resolve) => {
    const started = Date.now();
    let proc;
    try {
      proc = spawn(cmd, args, { cwd, stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
    } catch (err) {
      return resolve({
        ok: false,
        code: -1,
        status: "System Error",
        stdout: "",
        stderr: err.message,
        time: 0,
        timedOut: false,
      });
    }

    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      try {
        proc.kill("SIGKILL");
      } catch {}
    }, timeout);

    proc.stdout.on("data", (chunk) => {
      if (stdout.length < maxBuffer) stdout += chunk.toString("utf-8");
    });
    proc.stderr.on("data", (chunk) => {
      if (stderr.length < maxBuffer) stderr += chunk.toString("utf-8");
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        ok: false,
        code: -1,
        status: "Process Error",
        stdout,
        stderr: stderr || err.message,
        time: (Date.now() - started) / 1000,
        timedOut: false,
      });
    });

    proc.on("close", (code, signal) => {
      clearTimeout(timer);
      const elapsed = (Date.now() - started) / 1000;
      if (timedOut || signal === "SIGKILL" || signal === "SIGTERM") {
        return resolve({
          ok: false,
          code: null,
          status: "Time Limit Exceeded",
          stdout,
          stderr: stderr || "Execution timed out.",
          time: elapsed,
          timedOut: true,
        });
      }
      resolve({
        ok: code === 0,
        code,
        status: code === 0 ? "Finished" : "Runtime Error",
        stdout,
        stderr,
        time: elapsed,
        timedOut: false,
      });
    });

    if (input) {
      try {
        proc.stdin.write(input);
      } catch {}
    }
    try {
      proc.stdin.end();
    } catch {}
  });
}

/**
 * ============================================================================
 * ENGINE 1: ULTRA-FAST LOCAL RUNNER
 * ============================================================================
 */
class LocalExecutor {
  static supports(language) {
    const lang = String(language || "").toLowerCase();
    if (getDisableLocalLanguages().includes(lang)) return false;
    if (lang === "python") return Boolean(LOCAL_TOOLS.python);
    if (lang === "javascript") return Boolean(LOCAL_TOOLS.node);
    if (lang === "c") return Boolean(LOCAL_TOOLS.gcc);
    if (lang === "cpp") return Boolean(LOCAL_TOOLS.gpp);
    if (lang === "csharp") return Boolean(LOCAL_TOOLS.csc && (process.platform === "win32" || LOCAL_TOOLS.mono));
    if (lang === "java") return Boolean(LOCAL_TOOLS.javac && LOCAL_TOOLS.java);
    return false;
  }

  static async compile(language, tempDir, source) {
    if (language === "c") {
      const src = path.join(tempDir, "solution.c");
      const exe = path.join(tempDir, process.platform === "win32" ? "solution.exe" : "solution.out");
      await fs.promises.writeFile(src, source, "utf-8");
      const res = await spawnProcess(LOCAL_TOOLS.gcc, ["-O0", "-pipe", src, "-o", exe], { cwd: tempDir, timeout: 12000 });
      if (res.timedOut || res.status === "System Error" || res.status === "Process Error") {
        throw new Error(`C compiler timed out or failed (${res.status}): ${res.stderr || res.stdout || "timeout"}`);
      }
      if (res.ok && process.platform !== "win32") {
        try { await fs.promises.chmod(exe, 0o755); } catch {}
      }
      return { ok: res.ok, exePath: exe, compileOutput: res.stderr || res.stdout, status: res.ok ? "Finished" : "Compilation Error" };
    }
    if (language === "cpp") {
      const src = path.join(tempDir, "solution.cpp");
      const exe = path.join(tempDir, process.platform === "win32" ? "solution.exe" : "solution.out");
      await fs.promises.writeFile(src, source, "utf-8");
      const res = await spawnProcess(LOCAL_TOOLS.gpp, ["-O0", "-pipe", src, "-o", exe], { cwd: tempDir, timeout: 12000 });
      if (res.timedOut || res.status === "System Error" || res.status === "Process Error") {
        throw new Error(`C++ compiler timed out or failed (${res.status}): ${res.stderr || res.stdout || "timeout"}`);
      }
      if (res.ok && process.platform !== "win32") {
        try { await fs.promises.chmod(exe, 0o755); } catch {}
      }
      return { ok: res.ok, exePath: exe, compileOutput: res.stderr || res.stdout, status: res.ok ? "Finished" : "Compilation Error" };
    }
    if (language === "csharp") {
      const src = path.join(tempDir, "solution.cs");
      const exe = path.join(tempDir, "solution.exe");
      await fs.promises.writeFile(src, source, "utf-8");
      const isMcs = String(LOCAL_TOOLS.csc).toLowerCase().includes("mcs");
      const args = isMcs
        ? ["-nologo", "-optimize-", `-out:${exe}`, src]
        : ["/nologo", "/optimize-", `/out:${exe}`, src];
      const res = await spawnProcess(LOCAL_TOOLS.csc, args, { cwd: tempDir, timeout: 12000 });
      if (res.timedOut || res.status === "System Error" || res.status === "Process Error") {
        throw new Error(`C# compiler timed out or failed (${res.status}): ${res.stderr || res.stdout || "timeout"}`);
      }
      return { ok: res.ok, exePath: exe, compileOutput: res.stderr || res.stdout, status: res.ok ? "Finished" : "Compilation Error" };
    }
    if (language === "java") {
      let className = "Main";
      const pubMatch = source.match(/public\s+(?:final\s+)?class\s+([A-Za-z0-9_]+)/);
      if (pubMatch) {
        className = pubMatch[1];
      } else {
        const anyMatch = source.match(/class\s+([A-Za-z0-9_]+)/);
        className = anyMatch ? anyMatch[1] : "Main";
      }
      const src = path.join(tempDir, `${className}.java`);
      await fs.promises.writeFile(src, source, "utf-8");
      const javacArgs = [
        "-J-Xms16m",
        "-J-Xmx192m",
        "-J-XX:+TieredCompilation",
        "-J-XX:TieredStopAtLevel=1",
        "-J-XX:CICompilerCount=2",
        "-J-XX:ParallelGCThreads=1",
        "-encoding",
        "UTF-8",
        src,
      ];
      const res = await spawnProcess(LOCAL_TOOLS.javac, javacArgs, { cwd: tempDir, timeout: 12000 });
      if (res.timedOut || res.status === "System Error" || res.status === "Process Error") {
        throw new Error(`Java compilation timed out or failed (${res.status}): ${res.stderr || res.stdout || "timeout"}`);
      }
      if (!res.ok) {
        return { ok: false, compileOutput: res.stderr || res.stdout, status: "Compilation Error" };
      }
      const files = await fs.promises.readdir(tempDir);
      const classFiles = files.filter((f) => f.endsWith(".class")).map((f) => f.replace(".class", ""));
      const targetClass = classFiles.includes(className) ? className : classFiles[0] || className;
      return { ok: true, targetClass, tempDir, compileOutput: "", status: "Finished" };
    }
    return { ok: true };
  }

  static async runBinary(language, compileInfo, stdin, tempDir) {
    if (language === "c" || language === "cpp") {
      return spawnProcess(compileInfo.exePath, [], { cwd: tempDir, input: stdin, timeout: 3000 });
    }
    if (language === "csharp") {
      if (process.platform !== "win32" && LOCAL_TOOLS.mono) {
        return spawnProcess(LOCAL_TOOLS.mono, [compileInfo.exePath], { cwd: tempDir, input: stdin, timeout: 3500 });
      }
      return spawnProcess(compileInfo.exePath, [], { cwd: tempDir, input: stdin, timeout: 3500 });
    }
    if (language === "java") {
      const javaArgs = [
        "-Xms16m",
        "-Xmx128m",
        "-XX:+TieredCompilation",
        "-XX:TieredStopAtLevel=1",
        "-XX:CICompilerCount=2",
        "-XX:ParallelGCThreads=1",
        "-cp",
        compileInfo.tempDir,
        compileInfo.targetClass,
      ];
      return spawnProcess(LOCAL_TOOLS.java, javaArgs, {
        cwd: compileInfo.tempDir,
        input: stdin,
        timeout: 3500,
      });
    }
    throw new Error(`Unsupported binary language: ${language}`);
  }

  static async executeDebug(language, source, stdin) {
    if (!this.supports(language)) throw new Error(`Local tools not installed for language: ${language}`);
    const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "mits-debug-"));
    try {
      if (language === "python") {
        const src = path.join(tempDir, "solution.py");
        await fs.promises.writeFile(src, source, "utf-8");
        const res = await spawnProcess(LOCAL_TOOLS.python, ["-u", src], { cwd: tempDir, input: stdin, timeout: 3500 });
        return {
          passed: res.ok,
          stdout: res.stdout,
          stderr: res.stderr,
          compileOutput: "",
          status: res.status,
          time: res.time,
          memory: null,
          runner: "local",
        };
      }
      if (language === "javascript") {
        const src = path.join(tempDir, "solution.js");
        await fs.promises.writeFile(src, source, "utf-8");
        const res = await spawnProcess(LOCAL_TOOLS.node, ["--max-old-space-size=128", src], { cwd: tempDir, input: stdin, timeout: 3500 });
        return {
          passed: res.ok,
          stdout: res.stdout,
          stderr: res.stderr,
          compileOutput: "",
          status: res.status,
          time: res.time,
          memory: null,
          runner: "local",
        };
      }
      // Compiled languages:
      const comp = await this.compile(language, tempDir, source);
      if (!comp.ok) {
        return {
          passed: false,
          stdout: "",
          stderr: comp.compileOutput,
          compileOutput: comp.compileOutput,
          status: "Compilation Error",
          time: 0,
          memory: null,
          runner: "local",
        };
      }
      const run = await this.runBinary(language, comp, stdin, tempDir);
      return {
        passed: run.ok,
        stdout: run.stdout,
        stderr: run.stderr,
        compileOutput: comp.compileOutput || "",
        status: run.status,
        time: run.time,
        memory: null,
        runner: "local",
      };
    } finally {
      await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }

  static async executeTests(questionId, language, source, mode = "program") {
    if (!this.supports(language)) throw new Error(`Local tools not installed for language: ${language}`);
    const question = content.level3Questions.find((item) => item.id === questionId);
    if (!question) throw new Error("Question not found.");

    if (mode === "function") {
      const program = buildLevel3FunctionProgram(questionId, language, source, question.tests.map((t) => t.input));
      const execution = await this.executeDebug(language, program, "");
      let outputs = [];
      if (execution.passed) {
        try {
          outputs = JSON.parse(execution.stdout);
        } catch {
          throw new Error("Function harness returned invalid result format.");
        }
      }
      return question.tests.map((test, index) => {
        const item = outputs[index] || { ok: false, error: "" };
        const passed = execution.passed && item.ok && level3OutputPasses(question, test, item.output);
        return {
          label: test.public ? test.label : `Hidden test ${index + 1}`,
          public: Boolean(test.public),
          passed,
          actual: test.public ? String(item.output || "") : undefined,
          runnerStatus: item.ok ? execution.status : execution.status === "Finished" ? "Function error" : execution.status,
          detail: test.public ? String(item.error || execution.compileOutput || execution.stderr || "") : undefined,
        };
      });
    }

    // Program mode:
    const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "mits-tests-"));
    try {
      const tests = question.tests;
      // If interpreted language:
      if (language === "python" || language === "javascript") {
        const ext = language === "python" ? "py" : "js";
        const src = path.join(tempDir, `solution.${ext}`);
        await fs.promises.writeFile(src, source, "utf-8");
        const bin = language === "python" ? LOCAL_TOOLS.python : LOCAL_TOOLS.node;
        const baseArgs = language === "python" ? ["-u", src] : ["--max-old-space-size=128", src];

        // Execute all 5 tests concurrently
        const runs = await Promise.all(
          tests.map((test) => spawnProcess(bin, baseArgs, { cwd: tempDir, input: test.input, timeout: 3000 }))
        );

        return tests.map((test, index) => {
          const run = runs[index];
          const passed = run.ok && level3OutputPasses(question, test, run.stdout);
          return {
            label: test.public ? test.label : `Hidden test ${index + 1}`,
            public: Boolean(test.public),
            passed,
            actual: test.public ? String(run.stdout || "") : undefined,
            runnerStatus: run.status,
            detail: test.public ? String(run.stderr || "") : undefined,
          };
        });
      }

      // Compiled language (compile once, test 5 times)
      const comp = await this.compile(language, tempDir, source);
      if (!comp.ok) {
        return tests.map((test, index) => ({
          label: test.public ? test.label : `Hidden test ${index + 1}`,
          public: Boolean(test.public),
          passed: false,
          actual: test.public ? "" : undefined,
          runnerStatus: "Compilation Error",
          detail: test.public ? String(comp.compileOutput || "") : undefined,
        }));
      }

      // Run test cases against the compiled binary (sequential for heavy runtimes like Java and C# to avoid container OOM / throttling)
      const isHeavyRuntime = language === "java" || language === "csharp";
      let runs;
      if (isHeavyRuntime) {
        runs = [];
        for (const test of tests) {
          runs.push(await this.runBinary(language, comp, test.input, tempDir));
        }
      } else {
        runs = await Promise.all(
          tests.map((test) => this.runBinary(language, comp, test.input, tempDir))
        );
      }

      return tests.map((test, index) => {
        const run = runs[index];
        const passed = run.ok && level3OutputPasses(question, test, run.stdout);
        return {
          label: test.public ? test.label : `Hidden test ${index + 1}`,
          public: Boolean(test.public),
          passed,
          actual: test.public ? String(run.stdout || "") : undefined,
          runnerStatus: run.status,
          detail: test.public ? String(run.stderr || "") : undefined,
        };
      });
    } finally {
      await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    }
  }
}

function buildRemoteHeaders(cleanBase, authToken, authHeader = "X-Auth-Token") {
  const headers = { "Content-Type": "application/json" };
  const rapidApiKey = process.env.RAPIDAPI_KEY || process.env.X_RAPIDAPI_KEY;
  if (cleanBase.includes("rapidapi.com") || rapidApiKey) {
    if (rapidApiKey) headers["X-RapidAPI-Key"] = rapidApiKey;
    try {
      const u = new URL(cleanBase);
      headers["X-RapidAPI-Host"] = u.host;
    } catch {}
  }
  if (authToken) headers[authHeader] = authToken;
  return headers;
}

/**
 * ============================================================================
 * ENGINE 2 & 3: REMOTE JUDGE0 RUNNER (WITH FAST POLLING & SHORT TIMEOUT)
 * ============================================================================
 */
class Judge0Executor {
  static async executeDebug(runnerBase, language, source, stdin, authToken, authHeader = "X-Auth-Token") {
    const languageId = Number(judgeLanguageIds()[language]);
    if (!Number.isInteger(languageId) || languageId <= 0) {
      throw new Error("This language is not configured for the code runner.");
    }
    const cleanBase = String(runnerBase || "").replace(/\/+$/, "");
    const headers = buildRemoteHeaders(cleanBase, authToken, authHeader);

    const limits = {
      language_id: languageId,
      source_code: source,
      stdin,
      cpu_time_limit: 4,
      cpu_extra_time: 1,
      wall_time_limit: 10,
      memory_limit: 262144,
      max_processes_and_or_threads: 60,
    };

    let created;
    try {
      const waitResp = await fetch(`${cleanBase}/submissions?base64_encoded=false&wait=true`, {
        method: "POST",
        headers,
        body: JSON.stringify(limits),
        signal: AbortSignal.timeout(12000),
      });
      if (waitResp.ok) {
        const body = await waitResp.json();
        const statusId = Number(body.status_id || body.status?.id);
        if (statusId > 2) {
          return {
            passed: statusId === 3,
            stdout: String(body.stdout || ""),
            stderr: String(body.stderr || ""),
            compileOutput: String(body.compile_output || ""),
            status: String(body.status?.description || "Finished"),
            time: body.time || null,
            memory: body.memory || null,
            runner: cleanBase,
          };
        }
        created = body;
      }
    } catch {}

    if (!created?.token) {
      const createdResponse = await fetch(`${cleanBase}/submissions?base64_encoded=false`, {
        method: "POST",
        headers,
        body: JSON.stringify(limits),
        signal: AbortSignal.timeout(10000),
      });
      if (!createdResponse.ok) throw new Error(`Code runner HTTP error ${createdResponse.status}`);
      created = await createdResponse.json();
    }
    if (!created.token) throw new Error("Code runner did not return a run token.");

    const resultUrl = new URL(`${cleanBase}/submissions/${encodeURIComponent(created.token)}`);
    resultUrl.searchParams.set("base64_encoded", "false");
    resultUrl.searchParams.set("fields", "stdout,stderr,compile_output,status_id,status,time,memory");

    // Adaptive backoff polling up to ~75s total (120 polls, delay 100ms -> 500ms max)
    let delay = 100;
    for (let poll = 0; poll < 120; poll += 1) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(500, Math.floor(delay * 1.2));
      const resultResponse = await fetch(resultUrl, { headers, signal: AbortSignal.timeout(8000) });
      if (!resultResponse.ok) throw new Error(`Code runner HTTP error ${resultResponse.status}`);
      const result = await resultResponse.json();
      const statusId = Number(result.status_id || result.status?.id);
      if (statusId > 2) {
        return {
          passed: statusId === 3,
          stdout: String(result.stdout || ""),
          stderr: String(result.stderr || ""),
          compileOutput: String(result.compile_output || ""),
          status: String(result.status?.description || "Finished"),
          time: result.time || null,
          memory: result.memory || null,
          runner: cleanBase,
        };
      }
    }
    throw new Error(`Judge0 timed out on ${cleanBase} (waited 75s in queue/processing)`);
  }

  static async executeTests(runnerBase, questionId, language, source, mode = "program", authToken, authHeader = "X-Auth-Token") {
    const question = content.level3Questions.find((item) => item.id === questionId);
    const languageId = Number(judgeLanguageIds()[language]);
    if (!question || !Number.isInteger(languageId) || languageId <= 0) {
      throw new Error("This question or language is not configured for the code runner.");
    }
    const cleanBase = String(runnerBase || "").replace(/\/+$/, "");
    const headers = buildRemoteHeaders(cleanBase, authToken, authHeader);

    if (mode === "function") {
      const program = buildLevel3FunctionProgram(questionId, language, source, question.tests.map((test) => test.input));
      const execution = await this.executeDebug(cleanBase, language, program, "", authToken, authHeader);
      let outputs = [];
      if (execution.passed) {
        try {
          outputs = JSON.parse(execution.stdout);
        } catch {
          throw new Error("The function harness returned an invalid result.");
        }
      }
      return question.tests.map((test, index) => {
        const item = outputs[index] || { ok: false, error: "" };
        const passed = execution.passed && item.ok && level3OutputPasses(question, test, item.output);
        return {
          label: test.public ? test.label : `Hidden test ${index + 1}`,
          public: Boolean(test.public),
          passed,
          actual: test.public ? String(item.output || "") : undefined,
          runnerStatus: item.ok ? execution.status : execution.status === "Finished" ? "Function error" : execution.status,
          detail: test.public ? String(item.error || execution.compileOutput || execution.stderr || "") : undefined,
        };
      });
    }

    const tests = question.tests;
    const createResponse = await fetch(`${cleanBase}/submissions/batch?base64_encoded=false`, {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(12000),
      body: JSON.stringify({
        submissions: tests.map((test) => ({
          source_code: source,
          language_id: languageId,
          stdin: test.input,
          cpu_time_limit: 4,
          cpu_extra_time: 1,
          wall_time_limit: 10,
          memory_limit: 262144,
          max_processes_and_or_threads: 60,
        })),
      }),
    });
    if (!createResponse.ok) throw new Error(`Code runner HTTP error ${createResponse.status}`);
    const created = await createResponse.json();
    if (!Array.isArray(created) || created.length !== tests.length || created.some((item) => !item.token)) {
      throw new Error("Code runner did not return submission tokens.");
    }
    const tokens = created.map((item) => item.token);
    let results = [];
    let delay = 100;
    for (let poll = 0; poll < 120; poll += 1) {
      await new Promise((resolve) => setTimeout(resolve, delay));
      delay = Math.min(500, Math.floor(delay * 1.2));
      const resultUrl = new URL(`${cleanBase}/submissions/batch`);
      resultUrl.searchParams.set("tokens", tokens.join(","));
      resultUrl.searchParams.set("base64_encoded", "false");
      resultUrl.searchParams.set("fields", "token,stdout,stderr,compile_output,status_id,status");
      const resultResponse = await fetch(resultUrl, { headers, signal: AbortSignal.timeout(8000) });
      if (!resultResponse.ok) throw new Error(`Code runner HTTP error ${resultResponse.status}`);
      const payload = await resultResponse.json();
      results = payload.submissions || [];
      if (results.length === tests.length && results.every((result) => Number(result.status_id || result.status?.id) > 2)) {
        break;
      }
    }
    if (results.length !== tests.length || results.some((result) => Number(result.status_id || result.status?.id) <= 2)) {
      throw new Error(`Judge0 batch timed out on ${cleanBase} (waited 75s in queue)`);
    }
    return tests.map((test, index) => ({
      label: test.public ? test.label : `Hidden test ${index + 1}`,
      public: Boolean(test.public),
      passed: Number(results[index].status_id || results[index].status?.id) === 3 && level3OutputPasses(question, test, results[index].stdout),
      actual: test.public ? String(results[index].stdout || "") : undefined,
      runnerStatus: String(results[index].status?.description || results[index].status_id || "Unknown"),
      detail: test.public ? String(results[index].compile_output || results[index].stderr || results[index].message || "") : undefined,
    }));
  }
}

/**
 * ============================================================================
 * MULTI-TIER FALLBACK ORCHESTRATOR
 * ============================================================================
 */
function getRunnerEndpoints() {
  const primary = (process.env.JUDGE0_URL || "https://ce.judge0.com").trim();
  const fallbackRaw = (process.env.JUDGE0_FALLBACK_URLS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const fallbacks = fallbackRaw.length ? fallbackRaw : ["https://ce.judge0.com"];
  const list = [primary, ...fallbacks.filter((u) => u !== primary)];
  return list;
}

/**
 * Executes a debug run across available engines with seamless fallback.
 */
async function executeLevel3Debug(language, source, stdin) {
  const preferences = getLanguagePreferences(language);
  const errors = [];

  for (const pref of preferences) {
    if (pref === "local") {
      if (LocalExecutor.supports(language)) {
        try {
          const res = await LocalExecutor.executeDebug(language, source, stdin);
          return res;
        } catch (err) {
          console.warn(`[Level3 Runner] Local execution failed for ${language}:`, err.message);
          errors.push(`Local: ${err.message}`);
        }
      } else {
        errors.push(`Local: tools not installed or disabled for ${language}`);
      }
    } else if (pref === "remote") {
      const endpoints = getRunnerEndpoints();
      const authToken = process.env.JUDGE0_AUTH_TOKEN;
      const authHeader = process.env.JUDGE0_AUTH_HEADER || "X-Auth-Token";
      for (const endpoint of endpoints) {
        try {
          const res = await Judge0Executor.executeDebug(endpoint, language, source, stdin, authToken, authHeader);
          return res;
        } catch (err) {
          console.warn(`[Level3 Runner] Remote execution failed on ${endpoint}:`, err.message);
          errors.push(`${endpoint}: ${err.message}`);
        }
      }
    }
  }

  // If local was not explicitly in preferences but remote failed and local is not disabled, attempt local as last resort
  if (!preferences.includes("local") && !getDisableLocalLanguages().includes(String(language).toLowerCase()) && LocalExecutor.supports(language)) {
    try {
      return await LocalExecutor.executeDebug(language, source, stdin);
    } catch (err) {
      errors.push(`Local fallback: ${err.message}`);
    }
  }

  throw new Error(`All code runner engines failed. ${errors.join("; ")}`);
}

/**
 * Executes all 5 test cases across available engines with seamless fallback.
 */
async function executeLevel3Tests(questionId, language, source, mode = "program") {
  const preferences = getLanguagePreferences(language);
  const errors = [];

  for (const pref of preferences) {
    if (pref === "local") {
      if (LocalExecutor.supports(language)) {
        try {
          const t0 = Date.now();
          const results = await LocalExecutor.executeTests(questionId, language, source, mode);
          console.log(`[Level3 Runner] Executed 5 tests via local native engine for ${language} in ${Date.now() - t0}ms`);
          return results;
        } catch (err) {
          console.warn(`[Level3 Runner] Local test runner failed for ${language}:`, err.message);
          errors.push(`Local: ${err.message}`);
        }
      } else {
        errors.push(`Local: tools not installed or disabled for ${language}`);
      }
    } else if (pref === "remote") {
      const endpoints = getRunnerEndpoints();
      const authToken = process.env.JUDGE0_AUTH_TOKEN;
      const authHeader = process.env.JUDGE0_AUTH_HEADER || "X-Auth-Token";
      for (const endpoint of endpoints) {
        try {
          const t0 = Date.now();
          const results = await Judge0Executor.executeTests(endpoint, questionId, language, source, mode, authToken, authHeader);
          console.log(`[Level3 Runner] Executed 5 tests via ${endpoint} in ${Date.now() - t0}ms`);
          return results;
        } catch (err) {
          console.warn(`[Level3 Runner] Remote test runner failed on ${endpoint}:`, err.message);
          errors.push(`${endpoint}: ${err.message}`);
        }
      }
    }
  }

  // If local wasn't tried and not disabled, try it
  if (!preferences.includes("local") && !getDisableLocalLanguages().includes(String(language).toLowerCase()) && LocalExecutor.supports(language)) {
    try {
      return await LocalExecutor.executeTests(questionId, language, source, mode);
    } catch (err) {
      errors.push(`Local fallback: ${err.message}`);
    }
  }

  throw new Error(`All code runner engines failed. ${errors.join("; ")}`);
}

module.exports = {
  LOCAL_TOOLS,
  getLocalSupportedLanguages,
  getDisableLocalLanguages,
  getPreferRemoteLanguages,
  getLanguagePreferences,
  judgeLanguageIds,
  level3OutputPasses,
  buildLevel3FunctionProgram,
  executeLevel3Debug,
  executeLevel3Tests,
  LocalExecutor,
  Judge0Executor,
};
