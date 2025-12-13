/**
 * Single source of truth for the default BASIC demo code
 */
export const DEFAULT_BASIC_DEMO = `# count from [start] to [end] in [stream]
# {"start":{"type":"number"},"end":{"type":"number"}}
x = $.inputs.start
while x <= $.inputs.end
  call appendToStream $.inputs.stream {"count": x}
  x = x + 1
end
return x`;
