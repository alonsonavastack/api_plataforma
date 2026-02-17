
// test-regex.js

const escapeRegex = (string) => {
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
};

const generateAccentInsensitiveRegex = (searchTerm) => {
    const normalizedTerm = searchTerm.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const escapedTerm = escapeRegex(normalizedTerm);
    let regexStr = '';

    for (let char of escapedTerm) {
        switch (char.toLowerCase()) {
            case 'a': regexStr += '[aáàâä]'; break;
            case 'e': regexStr += '[eéèêë]'; break;
            case 'i': regexStr += '[iíìîï]'; break;
            case 'o': regexStr += '[oóòôö]'; break;
            case 'u': regexStr += '[uúùûü]'; break;
            case 'n': regexStr += '[nñ]'; break;
            default: regexStr += char;
        }
    }
    return new RegExp(regexStr, 'i');
};

const testCases = [
    { term: 'camion', target: 'camión', shouldMatch: true },
    { term: 'camión', target: 'camion', shouldMatch: true },
    { term: 'jose', target: 'José', shouldMatch: true },
    { term: 'Exito', target: 'éxito', shouldMatch: true },
    { term: 'ano', target: 'año', shouldMatch: true },
    { term: 'c++', target: 'c++', shouldMatch: true }, // Special char check
    { term: 'abc', target: 'def', shouldMatch: false },
];

console.log('--- Starting Regex Verification ---');
let allPassed = true;

testCases.forEach(({ term, target, shouldMatch }) => {
    const regex = generateAccentInsensitiveRegex(term);
    const match = regex.test(target);
    const passed = match === shouldMatch;
    console.log(`Term: "${term}" -> Regex: ${regex} | Target: "${target}" | Match: ${match} | Passed: ${passed ? '✅' : '❌'}`);
    if (!passed) allPassed = false;
});

if (allPassed) {
    console.log('\nAll tests passed successfully! 🎉');
    process.exit(0);
} else {
    console.error('\nSome tests failed. ❌');
    process.exit(1);
}
