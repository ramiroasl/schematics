import { NgModule } from '@angular/core';

@NgModule({
  bootstrap: [Proxy<%= classify(lazyModule) %>Component],
  declarations: [Proxy<%= classify(lazyModule) %>Component]
})
export class Proxy<%= classify(lazyModule) %>Module {}
