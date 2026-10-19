import { formatChecks, runDoctor } from '../helper/src/doctor.ts'

/** `npm run doctor`: the same checks as the terminal's `doctor`, without the helper running. */
const checks = await runDoctor()
console.log(formatChecks(checks).join('\n'))
process.exit(checks.some((c) => !c.ok && !c.warn) ? 1 : 0)
