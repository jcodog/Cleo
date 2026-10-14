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
 * Validate the structure of the Cobertura XML subset emitted by c8. We check
 * XML nesting and quoted attributes, not only non-empty files and closing
 * tags, so a truncated or malformed coverage document is rejected.
 */
export function validateCoverageXml(xml) {
  const value = xml.trim()
  const tags = /<(?:(?:"[^"]*"|'[^']*'|[^<>"'])*)>/g
  const stack = []
  let cursor = 0
  let roots = 0
  let packages = 0
  let packageEntries = 0
  let classes = 0

  // XML permits only predefined/numeric entities without a DTD. Reject
  // unknown references rather than treating malformed content as valid XML.
  if (/&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[\da-fA-F]+);)/.test(value)) {
    throw new Error("Invalid XML character reference in Cobertura report")
  }

  for (const match of value.matchAll(tags)) {
    const preceding = value.slice(cursor, match.index)
    if (preceding.includes("<")) {
      throw new Error("Malformed XML markup in Cobertura report")
    }
    cursor = match.index + match[0].length
    const tag = match[0]
    if (/^<\?xml\s/i.test(tag) && roots === 0 && stack.length === 0) {
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
      const closing = tag.match(/^<\/([A-Za-z_][\w.:-]*)\s*>$/)
      if (!closing || stack.pop() !== closing[1]) {
        throw new Error("Mismatched closing tag in Cobertura report")
      }
      continue
    }

    const selfClosing = /\/\s*>$/.test(tag)
    const opening = tag.match(/^<([A-Za-z_][\w.:-]*)([\s\S]*?)>$/)
    if (!opening) throw new Error("Malformed opening tag in Cobertura report")
    const name = opening[1]
    let attrs = opening[2].replace(/\/\s*$/, "").trim()
    while (attrs) {
      const attr = attrs.match(
        /^([A-Za-z_][\w.:-]*)\s*=\s*(?:"[^"<]*"|'[^'<]*')/
      )
      if (!attr) throw new Error("Malformed attribute in Cobertura report")
      attrs = attrs.slice(attr[0].length).trim()
    }

    if (stack.length === 0) {
      if (name !== "coverage") {
        throw new Error("Cobertura report must have a coverage root")
      }
      roots += 1
    }
    if (name === "coverage" && !/\bline-rate\s*=/.test(opening[2])) {
      throw new Error("Cobertura root is missing required coverage metrics")
    }
    if (name === "packages" && stack.at(-1) === "coverage") packages += 1
    if (name === "package" && stack.at(-1) === "packages") packageEntries += 1
    if (
      name === "class" &&
      stack.at(-1) === "classes" &&
      stack.includes("package")
    ) {
      classes += 1
    }
    if (!selfClosing) stack.push(name)
  }

  if (
    cursor !== value.length ||
    value.slice(cursor).includes("<") ||
    stack.length !== 0 ||
    roots !== 1 ||
    packages !== 1 ||
    packageEntries < 1 ||
    classes < 1
  ) {
    throw new Error("Invalid or incomplete Cobertura coverage document")
  }
}
