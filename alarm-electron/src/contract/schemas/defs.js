/**
 * Shared JSON Schema definitions referenced by every message schema.
 * Plain data: no imports, no logic.
 */

const nullableNumber = { anyOf: [{ type: 'number' }, { type: 'null' }] }

const settingsProps = {
  theme: { enum: ['system', 'light', 'dark'] },
  hourCycle: { enum: ['auto', '12h', '24h'] },
  snoozeMinutes: { type: 'integer', minimum: 1, maximum: 30 },
  rampSeconds: { enum: [0, 15, 30, 60, 120, 300, 600] },
  volume: { $ref: 'defs#/$defs/Volume' },
  defaultSound: { $ref: 'defs#/$defs/SoundRef' },
  defaultTask: { $ref: 'defs#/$defs/Task' },
  keepAwake: { type: 'boolean' },
  missedGraceMinutes: { enum: [5, 15, 30, 60, 120, 240] },
  openAtLogin: { type: 'boolean' },
}

export const defs = {
  $id: 'defs',
  $defs: {
    Id: { type: 'string', minLength: 1, maxLength: 80 },
    SoundRef: {
      type: 'object',
      required: ['kind', 'id'],
      additionalProperties: false,
      properties: {
        kind: { enum: ['builtin', 'custom'] },
        id: { type: 'string', minLength: 1, maxLength: 80 },
      },
    },
    Task: {
      type: 'object',
      required: ['type', 'difficulty', 'count'],
      additionalProperties: false,
      properties: {
        type: { enum: ['none', 'math', 'retype'] },
        difficulty: { enum: ['easy', 'medium', 'hard'] },
        count: { type: 'integer', minimum: 1, maximum: 5 },
      },
    },
    Days: {
      type: 'array',
      maxItems: 7,
      items: { type: 'integer', minimum: 0, maximum: 6 },
    },
    Label: { type: 'string', maxLength: 60 },
    Volume: { type: 'number', minimum: 0.05, maximum: 1 },
    RampSeconds: { type: 'integer', minimum: 0, maximum: 600 },
    AlarmDraft: {
      type: 'object',
      required: ['id', 'hour', 'minute', 'label', 'days', 'sound', 'volume', 'rampSeconds', 'snooze', 'task'],
      additionalProperties: false,
      properties: {
        id: { type: 'string', maxLength: 80 },
        hour: { type: 'integer', minimum: 0, maximum: 23 },
        minute: { type: 'integer', minimum: 0, maximum: 59 },
        label: { $ref: 'defs#/$defs/Label' },
        days: { $ref: 'defs#/$defs/Days' },
        sound: { $ref: 'defs#/$defs/SoundRef' },
        volume: { $ref: 'defs#/$defs/Volume' },
        rampSeconds: { $ref: 'defs#/$defs/RampSeconds' },
        snooze: { type: 'boolean' },
        task: { $ref: 'defs#/$defs/Task' },
      },
    },
    Alarm: {
      type: 'object',
      required: [
        'id',
        'hour',
        'minute',
        'label',
        'enabled',
        'days',
        'sound',
        'volume',
        'rampSeconds',
        'snooze',
        'task',
        'createdAt',
        'nextTriggerAt',
        'snoozeUntil',
        'ringingSince',
      ],
      additionalProperties: false,
      properties: {
        id: { $ref: 'defs#/$defs/Id' },
        hour: { type: 'integer', minimum: 0, maximum: 23 },
        minute: { type: 'integer', minimum: 0, maximum: 59 },
        label: { $ref: 'defs#/$defs/Label' },
        enabled: { type: 'boolean' },
        days: { $ref: 'defs#/$defs/Days' },
        sound: { $ref: 'defs#/$defs/SoundRef' },
        volume: { $ref: 'defs#/$defs/Volume' },
        rampSeconds: { $ref: 'defs#/$defs/RampSeconds' },
        snooze: { type: 'boolean' },
        task: { $ref: 'defs#/$defs/Task' },
        createdAt: { type: 'number' },
        nextTriggerAt: nullableNumber,
        snoozeUntil: nullableNumber,
        ringingSince: nullableNumber,
      },
    },
    SettingsPatch: {
      type: 'object',
      additionalProperties: false,
      properties: settingsProps,
    },
    Settings: {
      type: 'object',
      additionalProperties: false,
      required: Object.keys(settingsProps),
      properties: settingsProps,
    },
    Recent: {
      type: 'object',
      required: ['durationMs', 'label'],
      additionalProperties: false,
      properties: {
        durationMs: { type: 'number', minimum: 1000 },
        label: { $ref: 'defs#/$defs/Label' },
      },
    },
    Timer: {
      type: 'object',
      required: ['status', 'durationMs', 'endsAt', 'remainingMs', 'label', 'sound', 'recents'],
      additionalProperties: false,
      properties: {
        status: { enum: ['idle', 'running', 'paused', 'ringing'] },
        durationMs: { type: 'number', minimum: 1000 },
        endsAt: nullableNumber,
        remainingMs: { type: 'number', minimum: 0 },
        label: { $ref: 'defs#/$defs/Label' },
        sound: { $ref: 'defs#/$defs/SoundRef' },
        recents: { type: 'array', maxItems: 6, items: { $ref: 'defs#/$defs/Recent' } },
      },
    },
    Stopwatch: {
      type: 'object',
      required: ['startedAt', 'accumulatedMs', 'laps'],
      additionalProperties: false,
      properties: {
        startedAt: nullableNumber,
        accumulatedMs: { type: 'number', minimum: 0 },
        laps: { type: 'array', items: { type: 'number', minimum: 0 } },
      },
    },
    CustomSound: {
      type: 'object',
      required: ['id', 'name', 'size', 'addedAt', 'ext'],
      additionalProperties: false,
      properties: {
        id: { $ref: 'defs#/$defs/Id' },
        name: { type: 'string', maxLength: 255 },
        size: { type: 'number', minimum: 0 },
        addedAt: { type: 'number' },
        ext: { type: 'string', pattern: '^[a-z0-9]{1,5}$' },
      },
    },
    Problem: {
      type: 'object',
      required: ['kind', 'prompt', 'answer'],
      additionalProperties: false,
      properties: {
        kind: { enum: ['math', 'retype'] },
        prompt: { type: 'string', maxLength: 40 },
        answer: { type: 'string', maxLength: 20 },
      },
    },
    Source: { enum: ['schedule', 'snooze'] },
  },
}
