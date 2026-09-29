// ../sdk/dist/componentClient.js
var defineComponent = (fn) => fn;

// fixtures/frozen-artifacts-source/components/counter.ts
var counter_default = defineComponent((root, ctx) => {
  const line = document.createElement("p");
  line.setAttribute("class", "count");
  const bump = document.createElement("button");
  bump.setAttribute("type", "button");
  bump.setAttribute("class", "bump");
  bump.textContent = "Add one";
  root.append(line, bump);
  let n = typeof ctx.state?.n === "number" ? ctx.state.n : 0;
  const draw = () => line.textContent = `count ${n} of ${ctx.messages?.length ?? 0} messages`;
  bump.addEventListener("click", () => {
    n += 1;
    ctx.saveState({ n });
    draw();
  });
  draw();
  return ctx.subscribe((section) => {
    if (section === "state") {
      const saved = ctx.state?.n;
      if (typeof saved === "number") n = saved;
    }
    draw();
  });
});
export {
  counter_default as default
};
