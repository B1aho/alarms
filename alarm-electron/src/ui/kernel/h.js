/**
 * Virtual nodes. `h(tag, props, ...children)`.
 *
 * Props conventions (see patch.js):
 *  - `key`               identity among siblings
 *  - `class`, `style`    string / object
 *  - `on<event>`         `(event) => msg | undefined` — the runtime dispatches the returned message
 *  - `.name`             set as a DOM property instead of an attribute (custom elements, `value`)
 *  - `mounted`           `(el) => void` called once after the element is inserted
 *  - anything else       attribute (`true` → empty attribute, `false`/null/undefined → removed)
 */

/** @typedef {string | number | boolean | null | undefined | VNode | ChildList} Child */
/** @typedef {Array<any>} ChildList nested children (flattened by `h`) */
/**
 * @typedef {object} VNode
 * @property {string} tag  element name, or '#text'
 * @property {Record<string, any>} props
 * @property {VNode[]} children
 * @property {string | number | undefined} key
 * @property {string} [text]
 * @property {Node} [el]
 */

/** @param {string} text @returns {VNode} */
export const text = (text) => ({ tag: '#text', props: {}, children: [], key: undefined, text })

/**
 * @param {Child[]} input
 * @param {VNode[]} out
 */
function flatten(input, out) {
  for (const c of input) {
    if (c === null || c === undefined || c === false || c === true) continue
    if (Array.isArray(c)) flatten(c, out)
    else if (typeof c === 'string' || typeof c === 'number') out.push(text(String(c)))
    else out.push(c)
  }
  return out
}

/**
 * @param {string} tag
 * @param {Record<string, any> | null} [props]
 * @param {...Child} children
 * @returns {VNode}
 */
export function h(tag, props, ...children) {
  const p = props ?? {}
  return { tag, props: p, children: flatten(children, []), key: p.key }
}

/** Joins class names, skipping falsy ones. @param {...(string | false | null | undefined)} names */
export const cx = (...names) => names.filter(Boolean).join(' ')
