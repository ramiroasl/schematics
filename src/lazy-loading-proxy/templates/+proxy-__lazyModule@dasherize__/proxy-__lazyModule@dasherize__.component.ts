import { Component } from '@angular/core';

@Component({
  selector: 'proxy-<%= dasherize(lazyModule) %>',
  template: `<<%= dasherize(lazyModule) %>></<%= dasherize(lazyModule) %>>`
})
export class Proxy<%= classify(lazyModule) %>Component {}
