import assert from "node:assert/strict"

/**
 * Interpret our boolean Actions subset without executing workflow-controlled code.
 * @param {string} expression Job condition, optionally wrapped in Actions delimiters.
 * @param {object} context Scalar GitHub/input/needs/step values, read through own properties only.
 * @param {string[]} statuses Dependency conclusions used for implicit success and status functions.
 * @returns {boolean} Eligibility including implicit success unless an explicit status function is present.
 * @throws {AssertionError} On unsupported/malformed syntax, unsafe references or excessive complexity.
 */
export function evaluate(expression, context, statuses) {
  let source = expression.trim()
  if (source.startsWith("${{")) {
    assert.ok(source.endsWith("}}"), "Unclosed Actions expression")
    source = source.slice(3, -2).trim()
  }
  assert.ok(
    source.length > 0 && source.length < 8192,
    "Invalid expression size"
  )
  const tokens = []
  while (source.length) {
    const match =
      /^(?:\s+|'(?:[^']|'')*'|&&|\|\||==|!=|[!()]|[0-9]+\b|[A-Za-z_][\w-]*(?:\.[A-Za-z_][\w-]*)*)/.exec(
        source
      )
    assert.ok(match, "Unsupported Actions syntax")
    source = source.slice(match[0].length)
    if (match[0].trim()) tokens.push(match[0])
    assert.ok(tokens.length < 256, "Actions expression too complex")
  }
  let index = 0
  let statusFunction = false
  /** Consume exactly one expected token; never interpret an identifier as JavaScript. */
  const take = (token) => tokens[index] === token && (++index, true)
  /** Parse literals, grouped conditions, allow-listed zero-argument status calls and scalar context paths. */
  const primary = () => {
    if (take("(")) {
      const value = or()
      assert.ok(take(")"), "Unclosed expression group")
      return value
    }
    const token = tokens[index++]
    assert.ok(token, "Missing expression operand")
    if (token.startsWith("'")) return token.slice(1, -1).replaceAll("''", "'")
    if (/^[0-9]+$/.test(token)) return Number(token)
    if (token === "true" || token === "false") return token === "true"
    if (token === "null") return null
    if (["always", "success", "failure", "cancelled"].includes(token)) {
      assert.ok(take("(") && take(")"), "Status functions take no arguments")
      statusFunction = true
      return {
        always: true,
        success: statuses.every((s) => s === "success"),
        failure: statuses.includes("failure"),
        cancelled: statuses.includes("cancelled"),
      }[token]
    }
    const keys = token.split(".")
    assert.ok(
      ["github", "inputs", "needs", "vars", "steps", "job"].includes(keys[0]) &&
        keys.length > 1,
      "Unsupported expression reference"
    )
    let value = context
    for (const key of keys) {
      assert.ok(
        !["__proto__", "prototype", "constructor"].includes(key),
        "Unsafe expression reference"
      )
      value = value && Object.hasOwn(value, key) ? value[key] : undefined
    }
    assert.ok(
      value === null ||
        value === undefined ||
        ["string", "number", "boolean"].includes(typeof value),
      "Expression requires a scalar"
    )
    return value ?? ""
  }
  /** Apply logical negation before comparison and conjunction, matching Actions precedence. */
  const unary = () => (take("!") ? !unary() : primary())
  /** Compare scalars using case-insensitive string equality and Actions numeric coercion. */
  const comparison = () => {
    const left = unary()
    const operator = tokens[index]
    if (!["==", "!="].includes(operator)) return left
    index++
    const right = unary()
    /** Coerce supported JSON numbers, booleans and empty values; invalid numeric strings stay NaN. */
    const numeric = (value) => {
      if (
        value === null ||
        typeof value === "boolean" ||
        typeof value === "number"
      )
        return Number(value)
      if (value.trim() === "") return 0
      try {
        const parsed = JSON.parse(value)
        return typeof parsed === "number" && Number.isFinite(parsed)
          ? parsed
          : NaN
      } catch {
        return NaN
      }
    }
    const equal =
      typeof left !== typeof right
        ? numeric(left) === numeric(right)
        : typeof left === "string"
          ? left.toLowerCase() === right.toLowerCase()
          : left === right
    return operator === "==" ? equal : !equal
  }
  /** Consume both operands even when false, so unsupported syntax cannot hide behind short-circuiting. */
  const and = () => {
    let value = comparison()
    while (take("&&")) {
      const right = comparison()
      value = Boolean(value && right)
    }
    return value
  }
  /** Parse the lowest-precedence disjunction, still validating every operand. */
  const or = () => {
    let value = and()
    while (take("||")) {
      const right = and()
      value = Boolean(value || right)
    }
    return value
  }
  const value = or()
  assert.equal(index, tokens.length, "Unexpected expression token")
  return (
    Boolean(value) && (statusFunction || statuses.every((s) => s === "success"))
  )
}
