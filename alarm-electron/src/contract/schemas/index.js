/** All message schemas in one list (input for the ajv code generator and the contract tests). */

import { commandSchemas, serviceSchemas, systemSchemas } from '../commands.js'
import { eventSchemas } from '../events.js'
import { transientSchemas } from '../transient.js'
import { defs } from './defs.js'

export { defs }

export const messageSchemas = [...commandSchemas, ...systemSchemas, ...serviceSchemas, ...eventSchemas, ...transientSchemas]
