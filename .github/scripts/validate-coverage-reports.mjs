/**
 * Verify a complete Istanbul HTML report before it is published. This is
 * intentionally scoped to the index.html files emitted by c8, rather than
 * accepting arbitrary HTML documents as coverage reports.
 */
export function validateCoverageHtml(html) {
  const document = html.trim()
  const doctype = /^<!doctype\s+html\s*>/i.test(document)
  const structure =
    /<html\b[^>]*>[\s\S]*<head\b[^>]*>[\s\S]*<\/head\s*>[\s\S]*<body\b[^>]*>[\s\S]*<\/body\s*>\s*<\/html\s*>$/i.test(
      document
    )
  const summary =
    /<table\b[^>]*\bclass\s*=\s*(["'])[^"']*\bcoverage-summary\b[^"']*\1[^>]*>[\s\S]*<\/table\s*>/i.test(
      document
    )

  if (!doctype || !structure || !summary) {
    throw new Error("Invalid or incomplete Istanbul HTML coverage report")
  }
}

/**
 * Validate c8's Cobertura subset, including its optional UTF-8 XML declaration
 * and exact external DOCTYPE. The DTD is recognized as text and never loaded;
 * Other DTDs, entity declarations and processing instructions fail closed.
 */
export function validateCoverageXml(xml) {
  const value = xml.replace(/^\uFEFF/, "")
  const tags = /<(?:(?:"[^"]*"|'[^']*'|[^<>"'])*)>/g
  const stack = []
  let cursor = 0
  let roots = 0
  let declarationSeen = false
  let doctypeSeen = false
  const children = {
    coverage: ["sources", "packages"],
    sources: ["source"],
    source: [],
    packages: ["package"],
    package: ["classes"],
    classes: ["class"],
    class: ["methods", "lines"],
    methods: ["method"],
    method: ["lines"],
    lines: ["line"],
    line: [],
  }
  const required = {
    coverage: ["sources", "packages"],
    sources: ["source"],
    packages: ["package"],
    package: ["classes"],
    classes: ["class"],
    class: ["methods", "lines"],
    method: ["lines"],
    lines: ["line"],
  }
  /** Require each container's own children, so another valid class cannot hide an incomplete one. */
  function checkContainer(frame) {
    for (const child of required[frame.name] ?? [])
      if (!frame.children.has(child))
        throw new Error(`Missing ${child} structure in Cobertura ${frame.name}`)
  }

  // XML permits only predefined/numeric entities without a DTD. Reject
  // unknown references rather than treating malformed content as valid XML.
  if (/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);)/.test(value)) {
    throw new Error("Invalid XML character reference in Cobertura report")
  }
  // XML 1.0 excludes control characters, surrogate code points and invalid references.
  for (const character of value) {
    if (!isXmlCharacter(character.codePointAt(0)))
      throw new Error("Invalid XML character in Cobertura report")
  }
  for (const reference of value.matchAll(/&#(x[\da-fA-F]+|\d+);/g)) {
    const numeric = reference[1].startsWith("x")
      ? Number.parseInt(reference[1].slice(1), 16)
      : Number(reference[1])
    if (!isXmlCharacter(numeric))
      throw new Error("Invalid XML character reference in Cobertura report")
  }

  for (const match of value.matchAll(tags)) {
    const preceding = value.slice(cursor, match.index)
    if (
      preceding.includes("<") ||
      preceding.includes("]]>") ||
      (/[^ \t\r\n]/.test(preceding) && stack.at(-1)?.name !== "source")
    ) {
      throw new Error("Malformed XML markup in Cobertura report")
    }
    cursor = match.index + match[0].length
    const tag = match[0]
    if (/^<\?xml[ \t\r\n]/.test(tag)) {
      if (
        match.index !== 0 ||
        declarationSeen ||
        doctypeSeen ||
        !/^<\?xml[ \t\r\n]+version=(["'])1\.0\1(?:[ \t\r\n]+encoding=(["'])(?:UTF-8|utf-8)\2)?(?:[ \t\r\n]+standalone=(["'])(?:yes|no)\3)?[ \t\r\n]*\?>$/.test(
          tag
        )
      )
        throw new Error("Unsupported XML declaration in Cobertura report")
      declarationSeen = true
      continue
    }
    if (
      /^<!DOCTYPE[ \t\r\n]+coverage[ \t\r\n]+SYSTEM[ \t\r\n]+(["'])http:\/\/cobertura\.sourceforge\.net\/xml\/coverage-04\.dtd\1[ \t\r\n]*>$/.test(
        tag
      )
    ) {
      if (roots !== 0 || stack.length !== 0 || doctypeSeen)
        throw new Error("Unexpected Cobertura DOCTYPE location")
      doctypeSeen = true
      continue
    }
    if (
      tag.startsWith("<!--") ||
      tag.startsWith("<!") ||
      tag.startsWith("<?")
    ) {
      throw new Error("Unexpected XML declaration in Cobertura report")
    }
    if (tag.startsWith("</")) {
      const closing = tag.match(/^<\/([A-Za-z_][\w.:-]*)[ \t\r\n]*>$/)
      const frame = stack.pop()
      if (!closing || frame?.name !== closing[1]) {
        throw new Error("Mismatched closing tag in Cobertura report")
      }
      checkContainer(frame)
      continue
    }

    const selfClosing = /\/>$/.test(tag)
    const opening = tag.match(/^<([A-Za-z_][\w.:-]*)([\s\S]*?)>$/)
    if (!opening) throw new Error("Malformed opening tag in Cobertura report")
    const name = opening[1]
    const parent = stack.at(-1)
    if (
      !Object.hasOwn(children, name) ||
      (parent && !children[parent.name].includes(name))
    )
      throw new Error("Unexpected element hierarchy in Cobertura report")
    if (
      parent &&
      ["sources", "packages", "classes", "methods", "lines"].includes(name) &&
      parent.children.has(name)
    )
      throw new Error("Duplicate container in Cobertura report")
    parent?.children.add(name)
    let attrs = (selfClosing ? opening[2].slice(0, -1) : opening[2]).replace(
      /^[ \t\r\n]+|[ \t\r\n]+$/g,
      ""
    )
    const attributes = new Map()
    while (attrs) {
      const attr = attrs.match(
        /^([A-Za-z_][\w.:-]*)[ \t\r\n]*=[ \t\r\n]*(?:"([^"<]*)"|'([^'<]*)')([ \t\r\n]+|$)/
      )
      if (!attr || attributes.has(attr[1]))
        throw new Error("Malformed or duplicate attribute in Cobertura report")
      attributes.set(attr[1], attr[2] ?? attr[3])
      attrs = attrs.slice(attr[0].length)
    }

    if (stack.length === 0) {
      if (name !== "coverage") {
        throw new Error("Cobertura report must have a coverage root")
      }
      roots += 1
    }
    if (["coverage", "package", "class"].includes(name)) {
      for (const metric of ["line-rate", "branch-rate"]) {
        const rate = attributes.get(metric)
        if (!rate || !/^\d+(?:\.\d+)?$/.test(rate) || Number(rate) > 1)
          throw new Error("Cobertura element is missing valid coverage metrics")
      }
    }
    if (name === "class" && !attributes.get("filename"))
      throw new Error("Cobertura class is missing its filename")
    if (
      name === "line" &&
      (!/^[1-9]\d*$/.test(attributes.get("number") ?? "") ||
        !/^\d+$/.test(attributes.get("hits") ?? ""))
    )
      throw new Error("Cobertura line is missing valid hit counts")
    const frame = { name, children: new Set() }
    if (selfClosing) checkContainer(frame)
    else stack.push(frame)
  }

  if (
    /[^ \t\r\n]/.test(value.slice(cursor)) ||
    stack.length !== 0 ||
    roots !== 1
  ) {
    throw new Error("Invalid or incomplete Cobertura coverage document")
  }
}

/** Apply XML 1.0's permitted character ranges to literal and numeric reference values. */
function isXmlCharacter(value) {
  return (
    value === 9 ||
    value === 10 ||
    value === 13 ||
    (value >= 0x20 && value <= 0xd7ff) ||
    (value >= 0xe000 && value <= 0xfffd) ||
    (value >= 0x10000 && value <= 0x10ffff)
  )
}
