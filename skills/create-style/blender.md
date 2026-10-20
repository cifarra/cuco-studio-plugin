# Blender Style Playbook (stub)

> **Engine availability**: the Blender engine lives on branch
> `feat/blendergfx` (not yet merged to main).

This playbook has NOT been distilled yet. The branch evolved its own
conventions (v2 ships styles as **pure `.blend` files** — the earlier
style.json manifests were deleted), so do not guess from the WebGFX or AE
playbooks.

To build a Blender style today:
1. Check out `feat/blendergfx`.
2. Read its designers-docs section and implementation record in `docs/specs/`
   — those are authoritative for the .blend template conventions, the
   control-property (trinity) wiring, and the render/verification loop.
3. Apply the shared design doctrine from SKILL.md (design commitments,
   motion verb, visual verification, finish line).

When the branch merges to main, distill its docs into a full playbook here
(mirror the structure of ae.md / webgfx.md).
