const template = document.createElement("template");
template.innerHTML = `
    <h2>SDCN App Component</h2>
 `;
export default class Application extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this.shadowRoot?.append(template.content.cloneNode(true));
  }
}
