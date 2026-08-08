export async function runArduinoParse() {
  function parseLine(line) {
    const match = line.trim().match(/^(MQ7|MQ5):(\d+)$/);
    if (!match) return null;
    return { sensorKey: match[1], value: Number(match[2]) };
  }

  const cases = [
    ["MQ7:450", { sensorKey: "MQ7", value: 450 }],
    ["MQ5:120", { sensorKey: "MQ5", value: 120 }],
    ["bad", null],
  ];

  for (const [input, expected] of cases) {
    const actual = parseLine(input);
    const pass = JSON.stringify(actual) === JSON.stringify(expected);
    if (!pass) throw new Error(`Arduino parse failed for ${input}`);
  }

  return { passed: cases.length };
}
