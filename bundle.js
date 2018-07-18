(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory(require('icheques-webintegration')) :
	typeof define === 'function' && define.amd ? define(['icheques-webintegration'], factory) :
	(global.NetfactorIntegration = factory(global.ICheques));
}(this, (function (ICheques) { 'use strict';

	ICheques = ICheques && ICheques.hasOwnProperty('default') ? ICheques['default'] : ICheques;

	/** Virtual DOM Node */
	function VNode() {}

	/** Global options
	 *	@public
	 *	@namespace options {Object}
	 */
	var options = {

		/** If `true`, `prop` changes trigger synchronous component updates.
	  *	@name syncComponentUpdates
	  *	@type Boolean
	  *	@default true
	  */
		//syncComponentUpdates: true,

		/** Processes all created VNodes.
	  *	@param {VNode} vnode	A newly-created VNode to normalize/process
	  */
		//vnode(vnode) { }

		/** Hook invoked after a component is mounted. */
		// afterMount(component) { }

		/** Hook invoked after the DOM is updated with a component's latest render. */
		// afterUpdate(component) { }

		/** Hook invoked immediately before a component is unmounted. */
		// beforeUnmount(component) { }
	};

	var stack = [];

	var EMPTY_CHILDREN = [];

	/**
	 * JSX/hyperscript reviver.
	 * @see http://jasonformat.com/wtf-is-jsx
	 * Benchmarks: https://esbench.com/bench/57ee8f8e330ab09900a1a1a0
	 *
	 * Note: this is exported as both `h()` and `createElement()` for compatibility reasons.
	 *
	 * Creates a VNode (virtual DOM element). A tree of VNodes can be used as a lightweight representation
	 * of the structure of a DOM tree. This structure can be realized by recursively comparing it against
	 * the current _actual_ DOM structure, and applying only the differences.
	 *
	 * `h()`/`createElement()` accepts an element name, a list of attributes/props,
	 * and optionally children to append to the element.
	 *
	 * @example The following DOM tree
	 *
	 * `<div id="foo" name="bar">Hello!</div>`
	 *
	 * can be constructed using this function as:
	 *
	 * `h('div', { id: 'foo', name : 'bar' }, 'Hello!');`
	 *
	 * @param {string} nodeName	An element name. Ex: `div`, `a`, `span`, etc.
	 * @param {Object} attributes	Any attributes/props to set on the created element.
	 * @param rest			Additional arguments are taken to be children to append. Can be infinitely nested Arrays.
	 *
	 * @public
	 */
	function h(nodeName, attributes) {
		var arguments$1 = arguments;

		var children = EMPTY_CHILDREN,
		    lastSimple,
		    child,
		    simple,
		    i;
		for (i = arguments.length; i-- > 2;) {
			stack.push(arguments$1[i]);
		}
		if (attributes && attributes.children != null) {
			if (!stack.length) { stack.push(attributes.children); }
			delete attributes.children;
		}
		while (stack.length) {
			if ((child = stack.pop()) && child.pop !== undefined) {
				for (i = child.length; i--;) {
					stack.push(child[i]);
				}
			} else {
				if (typeof child === 'boolean') { child = null; }

				if (simple = typeof nodeName !== 'function') {
					if (child == null) { child = ''; }else if (typeof child === 'number') { child = String(child); }else if (typeof child !== 'string') { simple = false; }
				}

				if (simple && lastSimple) {
					children[children.length - 1] += child;
				} else if (children === EMPTY_CHILDREN) {
					children = [child];
				} else {
					children.push(child);
				}

				lastSimple = simple;
			}
		}

		var p = new VNode();
		p.nodeName = nodeName;
		p.children = children;
		p.attributes = attributes == null ? undefined : attributes;
		p.key = attributes == null ? undefined : attributes.key;

		// if a "vnode hook" is defined, pass every created VNode to it
		if (options.vnode !== undefined) { options.vnode(p); }

		return p;
	}

	/**
	 *  Copy all properties from `props` onto `obj`.
	 *  @param {Object} obj		Object onto which properties should be copied.
	 *  @param {Object} props	Object from which to copy properties.
	 *  @returns obj
	 *  @private
	 */
	function extend(obj, props) {
	  for (var i in props) {
	    obj[i] = props[i];
	  }return obj;
	}

	/**
	 * Call a function asynchronously, as soon as possible. Makes
	 * use of HTML Promise to schedule the callback if available,
	 * otherwise falling back to `setTimeout` (mainly for IE<11).
	 *
	 * @param {Function} callback
	 */
	var defer = typeof Promise == 'function' ? Promise.resolve().then.bind(Promise.resolve()) : setTimeout;

	// DOM properties that should NOT have "px" added when numeric
	var IS_NON_DIMENSIONAL = /acit|ex(?:s|g|n|p|$)|rph|ows|mnc|ntw|ine[ch]|zoo|^ord/i;

	/** Managed queue of dirty components to be re-rendered */

	var items = [];

	function enqueueRender(component) {
		if (!component._dirty && (component._dirty = true) && items.push(component) == 1) {
			(options.debounceRendering || defer)(rerender);
		}
	}

	function rerender() {
		var p,
		    list = items;
		items = [];
		while (p = list.pop()) {
			if (p._dirty) { renderComponent(p); }
		}
	}

	/**
	 * Check if two nodes are equivalent.
	 *
	 * @param {Node} node			DOM Node to compare
	 * @param {VNode} vnode			Virtual DOM node to compare
	 * @param {boolean} [hyrdating=false]	If true, ignores component constructors when comparing.
	 * @private
	 */
	function isSameNodeType(node, vnode, hydrating) {
	  if (typeof vnode === 'string' || typeof vnode === 'number') {
	    return node.splitText !== undefined;
	  }
	  if (typeof vnode.nodeName === 'string') {
	    return !node._componentConstructor && isNamedNode(node, vnode.nodeName);
	  }
	  return hydrating || node._componentConstructor === vnode.nodeName;
	}

	/**
	 * Check if an Element has a given nodeName, case-insensitively.
	 *
	 * @param {Element} node	A DOM Element to inspect the name of.
	 * @param {String} nodeName	Unnormalized name to compare against.
	 */
	function isNamedNode(node, nodeName) {
	  return node.normalizedNodeName === nodeName || node.nodeName.toLowerCase() === nodeName.toLowerCase();
	}

	/**
	 * Reconstruct Component-style `props` from a VNode.
	 * Ensures default/fallback values from `defaultProps`:
	 * Own-properties of `defaultProps` not present in `vnode.attributes` are added.
	 *
	 * @param {VNode} vnode
	 * @returns {Object} props
	 */
	function getNodeProps(vnode) {
	  var props = extend({}, vnode.attributes);
	  props.children = vnode.children;

	  var defaultProps = vnode.nodeName.defaultProps;
	  if (defaultProps !== undefined) {
	    for (var i in defaultProps) {
	      if (props[i] === undefined) {
	        props[i] = defaultProps[i];
	      }
	    }
	  }

	  return props;
	}

	/** Create an element with the given nodeName.
	 *	@param {String} nodeName
	 *	@param {Boolean} [isSvg=false]	If `true`, creates an element within the SVG namespace.
	 *	@returns {Element} node
	 */
	function createNode(nodeName, isSvg) {
		var node = isSvg ? document.createElementNS('http://www.w3.org/2000/svg', nodeName) : document.createElement(nodeName);
		node.normalizedNodeName = nodeName;
		return node;
	}

	/** Remove a child node from its parent if attached.
	 *	@param {Element} node		The node to remove
	 */
	function removeNode(node) {
		var parentNode = node.parentNode;
		if (parentNode) { parentNode.removeChild(node); }
	}

	/** Set a named attribute on the given Node, with special behavior for some names and event handlers.
	 *	If `value` is `null`, the attribute/handler will be removed.
	 *	@param {Element} node	An element to mutate
	 *	@param {string} name	The name/key to set, such as an event or attribute name
	 *	@param {any} old	The last value that was set for this name/node pair
	 *	@param {any} value	An attribute value, such as a function to be used as an event handler
	 *	@param {Boolean} isSvg	Are we currently diffing inside an svg?
	 *	@private
	 */
	function setAccessor(node, name, old, value, isSvg) {
		if (name === 'className') { name = 'class'; }

		if (name === 'key') ; else if (name === 'ref') {
			if (old) { old(null); }
			if (value) { value(node); }
		} else if (name === 'class' && !isSvg) {
			node.className = value || '';
		} else if (name === 'style') {
			if (!value || typeof value === 'string' || typeof old === 'string') {
				node.style.cssText = value || '';
			}
			if (value && typeof value === 'object') {
				if (typeof old !== 'string') {
					for (var i in old) {
						if (!(i in value)) { node.style[i] = ''; }
					}
				}
				for (var i in value) {
					node.style[i] = typeof value[i] === 'number' && IS_NON_DIMENSIONAL.test(i) === false ? value[i] + 'px' : value[i];
				}
			}
		} else if (name === 'dangerouslySetInnerHTML') {
			if (value) { node.innerHTML = value.__html || ''; }
		} else if (name[0] == 'o' && name[1] == 'n') {
			var useCapture = name !== (name = name.replace(/Capture$/, ''));
			name = name.toLowerCase().substring(2);
			if (value) {
				if (!old) { node.addEventListener(name, eventProxy, useCapture); }
			} else {
				node.removeEventListener(name, eventProxy, useCapture);
			}
			(node._listeners || (node._listeners = {}))[name] = value;
		} else if (name !== 'list' && name !== 'type' && !isSvg && name in node) {
			setProperty(node, name, value == null ? '' : value);
			if (value == null || value === false) { node.removeAttribute(name); }
		} else {
			var ns = isSvg && name !== (name = name.replace(/^xlink\:?/, ''));
			if (value == null || value === false) {
				if (ns) { node.removeAttributeNS('http://www.w3.org/1999/xlink', name.toLowerCase()); }else { node.removeAttribute(name); }
			} else if (typeof value !== 'function') {
				if (ns) { node.setAttributeNS('http://www.w3.org/1999/xlink', name.toLowerCase(), value); }else { node.setAttribute(name, value); }
			}
		}
	}

	/** Attempt to set a DOM property to the given value.
	 *	IE & FF throw for certain property-value combinations.
	 */
	function setProperty(node, name, value) {
		try {
			node[name] = value;
		} catch (e) {}
	}

	/** Proxy an event to hooked event handlers
	 *	@private
	 */
	function eventProxy(e) {
		return this._listeners[e.type](options.event && options.event(e) || e);
	}

	/** Queue of components that have been mounted and are awaiting componentDidMount */
	var mounts = [];

	/** Diff recursion count, used to track the end of the diff cycle. */
	var diffLevel = 0;

	/** Global flag indicating if the diff is currently within an SVG */
	var isSvgMode = false;

	/** Global flag indicating if the diff is performing hydration */
	var hydrating = false;

	/** Invoke queued componentDidMount lifecycle methods */
	function flushMounts() {
		var c;
		while (c = mounts.pop()) {
			if (options.afterMount) { options.afterMount(c); }
			if (c.componentDidMount) { c.componentDidMount(); }
		}
	}

	/** Apply differences in a given vnode (and it's deep children) to a real DOM Node.
	 *	@param {Element} [dom=null]		A DOM node to mutate into the shape of the `vnode`
	 *	@param {VNode} vnode			A VNode (with descendants forming a tree) representing the desired DOM structure
	 *	@returns {Element} dom			The created/mutated element
	 *	@private
	 */
	function diff(dom, vnode, context, mountAll, parent, componentRoot) {
		// diffLevel having been 0 here indicates initial entry into the diff (not a subdiff)
		if (!diffLevel++) {
			// when first starting the diff, check if we're diffing an SVG or within an SVG
			isSvgMode = parent != null && parent.ownerSVGElement !== undefined;

			// hydration is indicated by the existing element to be diffed not having a prop cache
			hydrating = dom != null && !('__preactattr_' in dom);
		}

		var ret = idiff(dom, vnode, context, mountAll, componentRoot);

		// append the element if its a new parent
		if (parent && ret.parentNode !== parent) { parent.appendChild(ret); }

		// diffLevel being reduced to 0 means we're exiting the diff
		if (! --diffLevel) {
			hydrating = false;
			// invoke queued componentDidMount lifecycle methods
			if (!componentRoot) { flushMounts(); }
		}

		return ret;
	}

	/** Internals of `diff()`, separated to allow bypassing diffLevel / mount flushing. */
	function idiff(dom, vnode, context, mountAll, componentRoot) {
		var out = dom,
		    prevSvgMode = isSvgMode;

		// empty values (null, undefined, booleans) render as empty Text nodes
		if (vnode == null || typeof vnode === 'boolean') { vnode = ''; }

		// Fast case: Strings & Numbers create/update Text nodes.
		if (typeof vnode === 'string' || typeof vnode === 'number') {

			// update if it's already a Text node:
			if (dom && dom.splitText !== undefined && dom.parentNode && (!dom._component || componentRoot)) {
				/* istanbul ignore if */ /* Browser quirk that can't be covered: https://github.com/developit/preact/commit/fd4f21f5c45dfd75151bd27b4c217d8003aa5eb9 */
				if (dom.nodeValue != vnode) {
					dom.nodeValue = vnode;
				}
			} else {
				// it wasn't a Text node: replace it with one and recycle the old Element
				out = document.createTextNode(vnode);
				if (dom) {
					if (dom.parentNode) { dom.parentNode.replaceChild(out, dom); }
					recollectNodeTree(dom, true);
				}
			}

			out['__preactattr_'] = true;

			return out;
		}

		// If the VNode represents a Component, perform a component diff:
		var vnodeName = vnode.nodeName;
		if (typeof vnodeName === 'function') {
			return buildComponentFromVNode(dom, vnode, context, mountAll);
		}

		// Tracks entering and exiting SVG namespace when descending through the tree.
		isSvgMode = vnodeName === 'svg' ? true : vnodeName === 'foreignObject' ? false : isSvgMode;

		// If there's no existing element or it's the wrong type, create a new one:
		vnodeName = String(vnodeName);
		if (!dom || !isNamedNode(dom, vnodeName)) {
			out = createNode(vnodeName, isSvgMode);

			if (dom) {
				// move children into the replacement node
				while (dom.firstChild) {
					out.appendChild(dom.firstChild);
				} // if the previous Element was mounted into the DOM, replace it inline
				if (dom.parentNode) { dom.parentNode.replaceChild(out, dom); }

				// recycle the old element (skips non-Element node types)
				recollectNodeTree(dom, true);
			}
		}

		var fc = out.firstChild,
		    props = out['__preactattr_'],
		    vchildren = vnode.children;

		if (props == null) {
			props = out['__preactattr_'] = {};
			for (var a = out.attributes, i = a.length; i--;) {
				props[a[i].name] = a[i].value;
			}
		}

		// Optimization: fast-path for elements containing a single TextNode:
		if (!hydrating && vchildren && vchildren.length === 1 && typeof vchildren[0] === 'string' && fc != null && fc.splitText !== undefined && fc.nextSibling == null) {
			if (fc.nodeValue != vchildren[0]) {
				fc.nodeValue = vchildren[0];
			}
		}
		// otherwise, if there are existing or new children, diff them:
		else if (vchildren && vchildren.length || fc != null) {
				innerDiffNode(out, vchildren, context, mountAll, hydrating || props.dangerouslySetInnerHTML != null);
			}

		// Apply attributes/props from VNode to the DOM Element:
		diffAttributes(out, vnode.attributes, props);

		// restore previous SVG mode: (in case we're exiting an SVG namespace)
		isSvgMode = prevSvgMode;

		return out;
	}

	/** Apply child and attribute changes between a VNode and a DOM Node to the DOM.
	 *	@param {Element} dom			Element whose children should be compared & mutated
	 *	@param {Array} vchildren		Array of VNodes to compare to `dom.childNodes`
	 *	@param {Object} context			Implicitly descendant context object (from most recent `getChildContext()`)
	 *	@param {Boolean} mountAll
	 *	@param {Boolean} isHydrating	If `true`, consumes externally created elements similar to hydration
	 */
	function innerDiffNode(dom, vchildren, context, mountAll, isHydrating) {
		var originalChildren = dom.childNodes,
		    children = [],
		    keyed = {},
		    keyedLen = 0,
		    min = 0,
		    len = originalChildren.length,
		    childrenLen = 0,
		    vlen = vchildren ? vchildren.length : 0,
		    j,
		    c,
		    f,
		    vchild,
		    child;

		// Build up a map of keyed children and an Array of unkeyed children:
		if (len !== 0) {
			for (var i = 0; i < len; i++) {
				var _child = originalChildren[i],
				    props = _child['__preactattr_'],
				    key = vlen && props ? _child._component ? _child._component.__key : props.key : null;
				if (key != null) {
					keyedLen++;
					keyed[key] = _child;
				} else if (props || (_child.splitText !== undefined ? isHydrating ? _child.nodeValue.trim() : true : isHydrating)) {
					children[childrenLen++] = _child;
				}
			}
		}

		if (vlen !== 0) {
			for (var i = 0; i < vlen; i++) {
				vchild = vchildren[i];
				child = null;

				// attempt to find a node based on key matching
				var key = vchild.key;
				if (key != null) {
					if (keyedLen && keyed[key] !== undefined) {
						child = keyed[key];
						keyed[key] = undefined;
						keyedLen--;
					}
				}
				// attempt to pluck a node of the same type from the existing children
				else if (!child && min < childrenLen) {
						for (j = min; j < childrenLen; j++) {
							if (children[j] !== undefined && isSameNodeType(c = children[j], vchild, isHydrating)) {
								child = c;
								children[j] = undefined;
								if (j === childrenLen - 1) { childrenLen--; }
								if (j === min) { min++; }
								break;
							}
						}
					}

				// morph the matched/found/created DOM child to match vchild (deep)
				child = idiff(child, vchild, context, mountAll);

				f = originalChildren[i];
				if (child && child !== dom && child !== f) {
					if (f == null) {
						dom.appendChild(child);
					} else if (child === f.nextSibling) {
						removeNode(f);
					} else {
						dom.insertBefore(child, f);
					}
				}
			}
		}

		// remove unused keyed children:
		if (keyedLen) {
			for (var i in keyed) {
				if (keyed[i] !== undefined) { recollectNodeTree(keyed[i], false); }
			}
		}

		// remove orphaned unkeyed children:
		while (min <= childrenLen) {
			if ((child = children[childrenLen--]) !== undefined) { recollectNodeTree(child, false); }
		}
	}

	/** Recursively recycle (or just unmount) a node and its descendants.
	 *	@param {Node} node						DOM node to start unmount/removal from
	 *	@param {Boolean} [unmountOnly=false]	If `true`, only triggers unmount lifecycle, skips removal
	 */
	function recollectNodeTree(node, unmountOnly) {
		var component = node._component;
		if (component) {
			// if node is owned by a Component, unmount that component (ends up recursing back here)
			unmountComponent(component);
		} else {
			// If the node's VNode had a ref function, invoke it with null here.
			// (this is part of the React spec, and smart for unsetting references)
			if (node['__preactattr_'] != null && node['__preactattr_'].ref) { node['__preactattr_'].ref(null); }

			if (unmountOnly === false || node['__preactattr_'] == null) {
				removeNode(node);
			}

			removeChildren(node);
		}
	}

	/** Recollect/unmount all children.
	 *	- we use .lastChild here because it causes less reflow than .firstChild
	 *	- it's also cheaper than accessing the .childNodes Live NodeList
	 */
	function removeChildren(node) {
		node = node.lastChild;
		while (node) {
			var next = node.previousSibling;
			recollectNodeTree(node, true);
			node = next;
		}
	}

	/** Apply differences in attributes from a VNode to the given DOM Element.
	 *	@param {Element} dom		Element with attributes to diff `attrs` against
	 *	@param {Object} attrs		The desired end-state key-value attribute pairs
	 *	@param {Object} old			Current/previous attributes (from previous VNode or element's prop cache)
	 */
	function diffAttributes(dom, attrs, old) {
		var name;

		// remove attributes no longer present on the vnode by setting them to undefined
		for (name in old) {
			if (!(attrs && attrs[name] != null) && old[name] != null) {
				setAccessor(dom, name, old[name], old[name] = undefined, isSvgMode);
			}
		}

		// add new & update changed attributes
		for (name in attrs) {
			if (name !== 'children' && name !== 'innerHTML' && (!(name in old) || attrs[name] !== (name === 'value' || name === 'checked' ? dom[name] : old[name]))) {
				setAccessor(dom, name, old[name], old[name] = attrs[name], isSvgMode);
			}
		}
	}

	/** Retains a pool of Components for re-use, keyed on component name.
	 *	Note: since component names are not unique or even necessarily available, these are primarily a form of sharding.
	 *	@private
	 */
	var components = {};

	/** Reclaim a component for later re-use by the recycler. */
	function collectComponent(component) {
		var name = component.constructor.name;
		(components[name] || (components[name] = [])).push(component);
	}

	/** Create a component. Normalizes differences between PFC's and classful Components. */
	function createComponent(Ctor, props, context) {
		var list = components[Ctor.name],
		    inst;

		if (Ctor.prototype && Ctor.prototype.render) {
			inst = new Ctor(props, context);
			Component.call(inst, props, context);
		} else {
			inst = new Component(props, context);
			inst.constructor = Ctor;
			inst.render = doRender;
		}

		if (list) {
			for (var i = list.length; i--;) {
				if (list[i].constructor === Ctor) {
					inst.nextBase = list[i].nextBase;
					list.splice(i, 1);
					break;
				}
			}
		}
		return inst;
	}

	/** The `.render()` method for a PFC backing instance. */
	function doRender(props, state, context) {
		return this.constructor(props, context);
	}

	/** Set a component's `props` (generally derived from JSX attributes).
	 *	@param {Object} props
	 *	@param {Object} [opts]
	 *	@param {boolean} [opts.renderSync=false]	If `true` and {@link options.syncComponentUpdates} is `true`, triggers synchronous rendering.
	 *	@param {boolean} [opts.render=true]			If `false`, no render will be triggered.
	 */
	function setComponentProps(component, props, opts, context, mountAll) {
		if (component._disable) { return; }
		component._disable = true;

		if (component.__ref = props.ref) { delete props.ref; }
		if (component.__key = props.key) { delete props.key; }

		if (!component.base || mountAll) {
			if (component.componentWillMount) { component.componentWillMount(); }
		} else if (component.componentWillReceiveProps) {
			component.componentWillReceiveProps(props, context);
		}

		if (context && context !== component.context) {
			if (!component.prevContext) { component.prevContext = component.context; }
			component.context = context;
		}

		if (!component.prevProps) { component.prevProps = component.props; }
		component.props = props;

		component._disable = false;

		if (opts !== 0) {
			if (opts === 1 || options.syncComponentUpdates !== false || !component.base) {
				renderComponent(component, 1, mountAll);
			} else {
				enqueueRender(component);
			}
		}

		if (component.__ref) { component.__ref(component); }
	}

	/** Render a Component, triggering necessary lifecycle events and taking High-Order Components into account.
	 *	@param {Component} component
	 *	@param {Object} [opts]
	 *	@param {boolean} [opts.build=false]		If `true`, component will build and store a DOM node if not already associated with one.
	 *	@private
	 */
	function renderComponent(component, opts, mountAll, isChild) {
		if (component._disable) { return; }

		var props = component.props,
		    state = component.state,
		    context = component.context,
		    previousProps = component.prevProps || props,
		    previousState = component.prevState || state,
		    previousContext = component.prevContext || context,
		    isUpdate = component.base,
		    nextBase = component.nextBase,
		    initialBase = isUpdate || nextBase,
		    initialChildComponent = component._component,
		    skip = false,
		    rendered,
		    inst,
		    cbase;

		// if updating
		if (isUpdate) {
			component.props = previousProps;
			component.state = previousState;
			component.context = previousContext;
			if (opts !== 2 && component.shouldComponentUpdate && component.shouldComponentUpdate(props, state, context) === false) {
				skip = true;
			} else if (component.componentWillUpdate) {
				component.componentWillUpdate(props, state, context);
			}
			component.props = props;
			component.state = state;
			component.context = context;
		}

		component.prevProps = component.prevState = component.prevContext = component.nextBase = null;
		component._dirty = false;

		if (!skip) {
			rendered = component.render(props, state, context);

			// context to pass to the child, can be updated via (grand-)parent component
			if (component.getChildContext) {
				context = extend(extend({}, context), component.getChildContext());
			}

			var childComponent = rendered && rendered.nodeName,
			    toUnmount,
			    base;

			if (typeof childComponent === 'function') {
				// set up high order component link

				var childProps = getNodeProps(rendered);
				inst = initialChildComponent;

				if (inst && inst.constructor === childComponent && childProps.key == inst.__key) {
					setComponentProps(inst, childProps, 1, context, false);
				} else {
					toUnmount = inst;

					component._component = inst = createComponent(childComponent, childProps, context);
					inst.nextBase = inst.nextBase || nextBase;
					inst._parentComponent = component;
					setComponentProps(inst, childProps, 0, context, false);
					renderComponent(inst, 1, mountAll, true);
				}

				base = inst.base;
			} else {
				cbase = initialBase;

				// destroy high order component link
				toUnmount = initialChildComponent;
				if (toUnmount) {
					cbase = component._component = null;
				}

				if (initialBase || opts === 1) {
					if (cbase) { cbase._component = null; }
					base = diff(cbase, rendered, context, mountAll || !isUpdate, initialBase && initialBase.parentNode, true);
				}
			}

			if (initialBase && base !== initialBase && inst !== initialChildComponent) {
				var baseParent = initialBase.parentNode;
				if (baseParent && base !== baseParent) {
					baseParent.replaceChild(base, initialBase);

					if (!toUnmount) {
						initialBase._component = null;
						recollectNodeTree(initialBase, false);
					}
				}
			}

			if (toUnmount) {
				unmountComponent(toUnmount);
			}

			component.base = base;
			if (base && !isChild) {
				var componentRef = component,
				    t = component;
				while (t = t._parentComponent) {
					(componentRef = t).base = base;
				}
				base._component = componentRef;
				base._componentConstructor = componentRef.constructor;
			}
		}

		if (!isUpdate || mountAll) {
			mounts.unshift(component);
		} else if (!skip) {
			// Ensure that pending componentDidMount() hooks of child components
			// are called before the componentDidUpdate() hook in the parent.
			// Note: disabled as it causes duplicate hooks, see https://github.com/developit/preact/issues/750
			// flushMounts();

			if (component.componentDidUpdate) {
				component.componentDidUpdate(previousProps, previousState, previousContext);
			}
			if (options.afterUpdate) { options.afterUpdate(component); }
		}

		if (component._renderCallbacks != null) {
			while (component._renderCallbacks.length) {
				component._renderCallbacks.pop().call(component);
			}
		}

		if (!diffLevel && !isChild) { flushMounts(); }
	}

	/** Apply the Component referenced by a VNode to the DOM.
	 *	@param {Element} dom	The DOM node to mutate
	 *	@param {VNode} vnode	A Component-referencing VNode
	 *	@returns {Element} dom	The created/mutated element
	 *	@private
	 */
	function buildComponentFromVNode(dom, vnode, context, mountAll) {
		var c = dom && dom._component,
		    originalComponent = c,
		    oldDom = dom,
		    isDirectOwner = c && dom._componentConstructor === vnode.nodeName,
		    isOwner = isDirectOwner,
		    props = getNodeProps(vnode);
		while (c && !isOwner && (c = c._parentComponent)) {
			isOwner = c.constructor === vnode.nodeName;
		}

		if (c && isOwner && (!mountAll || c._component)) {
			setComponentProps(c, props, 3, context, mountAll);
			dom = c.base;
		} else {
			if (originalComponent && !isDirectOwner) {
				unmountComponent(originalComponent);
				dom = oldDom = null;
			}

			c = createComponent(vnode.nodeName, props, context);
			if (dom && !c.nextBase) {
				c.nextBase = dom;
				// passing dom/oldDom as nextBase will recycle it if unused, so bypass recycling on L229:
				oldDom = null;
			}
			setComponentProps(c, props, 1, context, mountAll);
			dom = c.base;

			if (oldDom && dom !== oldDom) {
				oldDom._component = null;
				recollectNodeTree(oldDom, false);
			}
		}

		return dom;
	}

	/** Remove a component from the DOM and recycle it.
	 *	@param {Component} component	The Component instance to unmount
	 *	@private
	 */
	function unmountComponent(component) {
		if (options.beforeUnmount) { options.beforeUnmount(component); }

		var base = component.base;

		component._disable = true;

		if (component.componentWillUnmount) { component.componentWillUnmount(); }

		component.base = null;

		// recursively tear down & recollect high-order component children:
		var inner = component._component;
		if (inner) {
			unmountComponent(inner);
		} else if (base) {
			if (base['__preactattr_'] && base['__preactattr_'].ref) { base['__preactattr_'].ref(null); }

			component.nextBase = base;

			removeNode(base);
			collectComponent(component);

			removeChildren(base);
		}

		if (component.__ref) { component.__ref(null); }
	}

	/** Base Component class.
	 *	Provides `setState()` and `forceUpdate()`, which trigger rendering.
	 *	@public
	 *
	 *	@example
	 *	class MyFoo extends Component {
	 *		render(props, state) {
	 *			return <div />;
	 *		}
	 *	}
	 */
	function Component(props, context) {
		this._dirty = true;

		/** @public
	  *	@type {object}
	  */
		this.context = context;

		/** @public
	  *	@type {object}
	  */
		this.props = props;

		/** @public
	  *	@type {object}
	  */
		this.state = this.state || {};
	}

	extend(Component.prototype, {

		/** Returns a `boolean` indicating if the component should re-render when receiving the given `props` and `state`.
	  *	@param {object} nextProps
	  *	@param {object} nextState
	  *	@param {object} nextContext
	  *	@returns {Boolean} should the component re-render
	  *	@name shouldComponentUpdate
	  *	@function
	  */

		/** Update component state by copying properties from `state` to `this.state`.
	  *	@param {object} state		A hash of state properties to update with new values
	  *	@param {function} callback	A function to be called once component state is updated
	  */
		setState: function setState(state, callback) {
			var s = this.state;
			if (!this.prevState) { this.prevState = extend({}, s); }
			extend(s, typeof state === 'function' ? state(s, this.props) : state);
			if (callback) { (this._renderCallbacks = this._renderCallbacks || []).push(callback); }
			enqueueRender(this);
		},


		/** Immediately perform a synchronous re-render of the component.
	  *	@param {function} callback		A function to be called after component is re-rendered.
	  *	@private
	  */
		forceUpdate: function forceUpdate(callback) {
			if (callback) { (this._renderCallbacks = this._renderCallbacks || []).push(callback); }
			renderComponent(this, 2);
		},


		/** Accepts `props` and `state`, and returns a new Virtual DOM tree to build.
	  *	Virtual DOM is generally constructed via [JSX](http://jasonformat.com/wtf-is-jsx).
	  *	@param {object} props		Props (eg: JSX attributes) received from parent element/component
	  *	@param {object} state		The component's current state
	  *	@param {object} context		Context object (if a parent component has provided context)
	  *	@returns VNode
	  */
		render: function render() {}
	});

	/** Render JSX into a `parent` Element.
	 *	@param {VNode} vnode		A (JSX) VNode to render
	 *	@param {Element} parent		DOM element to render into
	 *	@param {Element} [merge]	Attempt to re-use an existing DOM tree rooted at `merge`
	 *	@public
	 *
	 *	@example
	 *	// render a div into <body>:
	 *	render(<div id="hello">hello!</div>, document.body);
	 *
	 *	@example
	 *	// render a "Thing" component into #foo:
	 *	const Thing = ({ name }) => <span>{ name }</span>;
	 *	render(<Thing name="one" />, document.querySelector('#foo'));
	 */
	function render(vnode, parent, merge) {
	  return diff(merge, vnode, {}, false, parent, false);
	}

	var commonjsGlobal = typeof window !== 'undefined' ? window : typeof global !== 'undefined' ? global : typeof self !== 'undefined' ? self : {};

	function unwrapExports (x) {
		return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, 'default') ? x['default'] : x;
	}

	function createCommonjsModule(fn, module) {
		return module = { exports: {} }, fn(module, module.exports), module.exports;
	}

	/**
	 * The base implementation of `_.findIndex` and `_.findLastIndex` without
	 * support for iteratee shorthands.
	 *
	 * @private
	 * @param {Array} array The array to inspect.
	 * @param {Function} predicate The function invoked per iteration.
	 * @param {number} fromIndex The index to search from.
	 * @param {boolean} [fromRight] Specify iterating from right to left.
	 * @returns {number} Returns the index of the matched value, else `-1`.
	 */
	function baseFindIndex(array, predicate, fromIndex, fromRight) {
	  var length = array.length,
	      index = fromIndex + (fromRight ? 1 : -1);

	  while ((fromRight ? index-- : ++index < length)) {
	    if (predicate(array[index], index, array)) {
	      return index;
	    }
	  }
	  return -1;
	}

	var _baseFindIndex = baseFindIndex;

	var _baseFindIndex$1 = /*#__PURE__*/Object.freeze({
		default: _baseFindIndex,
		__moduleExports: _baseFindIndex
	});

	/**
	 * The base implementation of `_.isNaN` without support for number objects.
	 *
	 * @private
	 * @param {*} value The value to check.
	 * @returns {boolean} Returns `true` if `value` is `NaN`, else `false`.
	 */
	function baseIsNaN(value) {
	  return value !== value;
	}

	var _baseIsNaN = baseIsNaN;

	var _baseIsNaN$1 = /*#__PURE__*/Object.freeze({
		default: _baseIsNaN,
		__moduleExports: _baseIsNaN
	});

	/**
	 * A specialized version of `_.indexOf` which performs strict equality
	 * comparisons of values, i.e. `===`.
	 *
	 * @private
	 * @param {Array} array The array to inspect.
	 * @param {*} value The value to search for.
	 * @param {number} fromIndex The index to search from.
	 * @returns {number} Returns the index of the matched value, else `-1`.
	 */
	function strictIndexOf(array, value, fromIndex) {
	  var index = fromIndex - 1,
	      length = array.length;

	  while (++index < length) {
	    if (array[index] === value) {
	      return index;
	    }
	  }
	  return -1;
	}

	var _strictIndexOf = strictIndexOf;

	var _strictIndexOf$1 = /*#__PURE__*/Object.freeze({
		default: _strictIndexOf,
		__moduleExports: _strictIndexOf
	});

	var baseFindIndex$1 = ( _baseFindIndex$1 && _baseFindIndex ) || _baseFindIndex$1;

	var baseIsNaN$1 = ( _baseIsNaN$1 && _baseIsNaN ) || _baseIsNaN$1;

	var strictIndexOf$1 = ( _strictIndexOf$1 && _strictIndexOf ) || _strictIndexOf$1;

	/**
	 * The base implementation of `_.indexOf` without `fromIndex` bounds checks.
	 *
	 * @private
	 * @param {Array} array The array to inspect.
	 * @param {*} value The value to search for.
	 * @param {number} fromIndex The index to search from.
	 * @returns {number} Returns the index of the matched value, else `-1`.
	 */
	function baseIndexOf(array, value, fromIndex) {
	  return value === value
	    ? strictIndexOf$1(array, value, fromIndex)
	    : baseFindIndex$1(array, baseIsNaN$1, fromIndex);
	}

	var _baseIndexOf = baseIndexOf;

	var _baseIndexOf$1 = /*#__PURE__*/Object.freeze({
		default: _baseIndexOf,
		__moduleExports: _baseIndexOf
	});

	/**
	 * Checks if `value` is classified as an `Array` object.
	 *
	 * @static
	 * @memberOf _
	 * @since 0.1.0
	 * @category Lang
	 * @param {*} value The value to check.
	 * @returns {boolean} Returns `true` if `value` is an array, else `false`.
	 * @example
	 *
	 * _.isArray([1, 2, 3]);
	 * // => true
	 *
	 * _.isArray(document.body.children);
	 * // => false
	 *
	 * _.isArray('abc');
	 * // => false
	 *
	 * _.isArray(_.noop);
	 * // => false
	 */
	var isArray = Array.isArray;

	var isArray_1 = isArray;

	var isArray$1 = /*#__PURE__*/Object.freeze({
		default: isArray_1,
		__moduleExports: isArray_1
	});

	/**
	 * This method returns `undefined`.
	 *
	 * @static
	 * @memberOf _
	 * @since 2.3.0
	 * @category Util
	 * @example
	 *
	 * _.times(2, _.noop);
	 * // => [undefined, undefined]
	 */
	function noop() {
	  // No operation performed.
	}

	var noop_1 = noop;

	var noop$1 = /*#__PURE__*/Object.freeze({
		default: noop_1,
		__moduleExports: noop_1
	});

	var onlyOnce_1 = createCommonjsModule(function (module, exports) {

	Object.defineProperty(exports, "__esModule", {
	    value: true
	});
	exports.default = onlyOnce;
	function onlyOnce(fn) {
	    return function () {
	        if (fn === null) { throw new Error("Callback was already called."); }
	        var callFn = fn;
	        fn = null;
	        callFn.apply(this, arguments);
	    };
	}
	module.exports = exports["default"];
	});

	var onlyOnce = unwrapExports(onlyOnce_1);

	var onlyOnce$1 = /*#__PURE__*/Object.freeze({
		default: onlyOnce,
		__moduleExports: onlyOnce_1
	});

	var slice_1 = createCommonjsModule(function (module, exports) {

	Object.defineProperty(exports, "__esModule", {
	    value: true
	});
	exports.default = slice;
	function slice(arrayLike, start) {
	    start = start | 0;
	    var newLen = Math.max(arrayLike.length - start, 0);
	    var newArr = Array(newLen);
	    for (var idx = 0; idx < newLen; idx++) {
	        newArr[idx] = arrayLike[start + idx];
	    }
	    return newArr;
	}
	module.exports = exports["default"];
	});

	var slice = unwrapExports(slice_1);

	var slice$1 = /*#__PURE__*/Object.freeze({
		default: slice,
		__moduleExports: slice_1
	});

	var _slice = ( slice$1 && slice ) || slice$1;

	var setImmediate_1 = createCommonjsModule(function (module, exports) {

	Object.defineProperty(exports, "__esModule", {
	    value: true
	});
	exports.hasNextTick = exports.hasSetImmediate = undefined;
	exports.fallback = fallback;
	exports.wrap = wrap;



	var _slice2 = _interopRequireDefault(_slice);

	function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

	var hasSetImmediate = exports.hasSetImmediate = typeof setImmediate === 'function' && setImmediate;
	var hasNextTick = exports.hasNextTick = typeof process === 'object' && typeof process.nextTick === 'function';

	function fallback(fn) {
	    setTimeout(fn, 0);
	}

	function wrap(defer) {
	    return function (fn /*, ...args*/) {
	        var args = (0, _slice2.default)(arguments, 1);
	        defer(function () {
	            fn.apply(null, args);
	        });
	    };
	}

	var _defer;

	if (hasSetImmediate) {
	    _defer = setImmediate;
	} else if (hasNextTick) {
	    _defer = process.nextTick;
	} else {
	    _defer = fallback;
	}

	exports.default = wrap(_defer);
	});

	var setImmediate$1 = unwrapExports(setImmediate_1);
	var setImmediate_2 = setImmediate_1.hasNextTick;
	var setImmediate_3 = setImmediate_1.hasSetImmediate;
	var setImmediate_4 = setImmediate_1.fallback;
	var setImmediate_5 = setImmediate_1.wrap;

	var setImmediate$2 = /*#__PURE__*/Object.freeze({
		default: setImmediate$1,
		__moduleExports: setImmediate_1,
		hasNextTick: setImmediate_2,
		hasSetImmediate: setImmediate_3,
		fallback: setImmediate_4,
		wrap: setImmediate_5
	});

	var DoublyLinkedList = createCommonjsModule(function (module, exports) {

	Object.defineProperty(exports, "__esModule", {
	    value: true
	});
	exports.default = DLL;
	// Simple doubly linked list (https://en.wikipedia.org/wiki/Doubly_linked_list) implementation
	// used for queues. This implementation assumes that the node provided by the user can be modified
	// to adjust the next and last properties. We implement only the minimal functionality
	// for queue support.
	function DLL() {
	    this.head = this.tail = null;
	    this.length = 0;
	}

	function setInitial(dll, node) {
	    dll.length = 1;
	    dll.head = dll.tail = node;
	}

	DLL.prototype.removeLink = function (node) {
	    if (node.prev) { node.prev.next = node.next; }else { this.head = node.next; }
	    if (node.next) { node.next.prev = node.prev; }else { this.tail = node.prev; }

	    node.prev = node.next = null;
	    this.length -= 1;
	    return node;
	};

	DLL.prototype.empty = function () {
	    var this$1 = this;

	    while (this.head) { this$1.shift(); }
	    return this;
	};

	DLL.prototype.insertAfter = function (node, newNode) {
	    newNode.prev = node;
	    newNode.next = node.next;
	    if (node.next) { node.next.prev = newNode; }else { this.tail = newNode; }
	    node.next = newNode;
	    this.length += 1;
	};

	DLL.prototype.insertBefore = function (node, newNode) {
	    newNode.prev = node.prev;
	    newNode.next = node;
	    if (node.prev) { node.prev.next = newNode; }else { this.head = newNode; }
	    node.prev = newNode;
	    this.length += 1;
	};

	DLL.prototype.unshift = function (node) {
	    if (this.head) { this.insertBefore(this.head, node); }else { setInitial(this, node); }
	};

	DLL.prototype.push = function (node) {
	    if (this.tail) { this.insertAfter(this.tail, node); }else { setInitial(this, node); }
	};

	DLL.prototype.shift = function () {
	    return this.head && this.removeLink(this.head);
	};

	DLL.prototype.pop = function () {
	    return this.tail && this.removeLink(this.tail);
	};

	DLL.prototype.toArray = function () {
	    var arr = Array(this.length);
	    var curr = this.head;
	    for (var idx = 0; idx < this.length; idx++) {
	        arr[idx] = curr.data;
	        curr = curr.next;
	    }
	    return arr;
	};

	DLL.prototype.remove = function (testFn) {
	    var this$1 = this;

	    var curr = this.head;
	    while (!!curr) {
	        var next = curr.next;
	        if (testFn(curr)) {
	            this$1.removeLink(curr);
	        }
	        curr = next;
	    }
	    return this;
	};
	module.exports = exports["default"];
	});

	var DoublyLinkedList$1 = unwrapExports(DoublyLinkedList);

	var DoublyLinkedList$2 = /*#__PURE__*/Object.freeze({
		default: DoublyLinkedList$1,
		__moduleExports: DoublyLinkedList
	});

	/**
	 * Checks if `value` is the
	 * [language type](http://www.ecma-international.org/ecma-262/7.0/#sec-ecmascript-language-types)
	 * of `Object`. (e.g. arrays, functions, objects, regexes, `new Number(0)`, and `new String('')`)
	 *
	 * @static
	 * @memberOf _
	 * @since 0.1.0
	 * @category Lang
	 * @param {*} value The value to check.
	 * @returns {boolean} Returns `true` if `value` is an object, else `false`.
	 * @example
	 *
	 * _.isObject({});
	 * // => true
	 *
	 * _.isObject([1, 2, 3]);
	 * // => true
	 *
	 * _.isObject(_.noop);
	 * // => true
	 *
	 * _.isObject(null);
	 * // => false
	 */
	function isObject(value) {
	  var type = typeof value;
	  return value != null && (type == 'object' || type == 'function');
	}

	var isObject_1 = isObject;

	var isObject$1 = /*#__PURE__*/Object.freeze({
		default: isObject_1,
		__moduleExports: isObject_1
	});

	var initialParams = createCommonjsModule(function (module, exports) {

	Object.defineProperty(exports, "__esModule", {
	    value: true
	});

	exports.default = function (fn) {
	    return function () /*...args, callback*/{
	        var args = (0, _slice2.default)(arguments);
	        var callback = args.pop();
	        fn.call(this, args, callback);
	    };
	};



	var _slice2 = _interopRequireDefault(_slice);

	function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

	module.exports = exports['default'];
	});

	var initialParams$1 = unwrapExports(initialParams);

	var initialParams$2 = /*#__PURE__*/Object.freeze({
		default: initialParams$1,
		__moduleExports: initialParams
	});

	var isObject$2 = ( isObject$1 && isObject_1 ) || isObject$1;

	var _initialParams = ( initialParams$2 && initialParams$1 ) || initialParams$2;

	var _setImmediate = ( setImmediate$2 && setImmediate$1 ) || setImmediate$2;

	var asyncify_1 = createCommonjsModule(function (module, exports) {

	Object.defineProperty(exports, "__esModule", {
	    value: true
	});
	exports.default = asyncify;



	var _isObject2 = _interopRequireDefault(isObject$2);



	var _initialParams2 = _interopRequireDefault(_initialParams);



	var _setImmediate2 = _interopRequireDefault(_setImmediate);

	function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

	/**
	 * Take a sync function and make it async, passing its return value to a
	 * callback. This is useful for plugging sync functions into a waterfall,
	 * series, or other async functions. Any arguments passed to the generated
	 * function will be passed to the wrapped function (except for the final
	 * callback argument). Errors thrown will be passed to the callback.
	 *
	 * If the function passed to `asyncify` returns a Promise, that promises's
	 * resolved/rejected state will be used to call the callback, rather than simply
	 * the synchronous return value.
	 *
	 * This also means you can asyncify ES2017 `async` functions.
	 *
	 * @name asyncify
	 * @static
	 * @memberOf module:Utils
	 * @method
	 * @alias wrapSync
	 * @category Util
	 * @param {Function} func - The synchronous function, or Promise-returning
	 * function to convert to an {@link AsyncFunction}.
	 * @returns {AsyncFunction} An asynchronous wrapper of the `func`. To be
	 * invoked with `(args..., callback)`.
	 * @example
	 *
	 * // passing a regular synchronous function
	 * async.waterfall([
	 *     async.apply(fs.readFile, filename, "utf8"),
	 *     async.asyncify(JSON.parse),
	 *     function (data, next) {
	 *         // data is the result of parsing the text.
	 *         // If there was a parsing error, it would have been caught.
	 *     }
	 * ], callback);
	 *
	 * // passing a function returning a promise
	 * async.waterfall([
	 *     async.apply(fs.readFile, filename, "utf8"),
	 *     async.asyncify(function (contents) {
	 *         return db.model.create(contents);
	 *     }),
	 *     function (model, next) {
	 *         // `model` is the instantiated model object.
	 *         // If there was an error, this function would be skipped.
	 *     }
	 * ], callback);
	 *
	 * // es2017 example, though `asyncify` is not needed if your JS environment
	 * // supports async functions out of the box
	 * var q = async.queue(async.asyncify(async function(file) {
	 *     var intermediateStep = await processFile(file);
	 *     return await somePromise(intermediateStep)
	 * }));
	 *
	 * q.push(files);
	 */
	function asyncify(func) {
	    return (0, _initialParams2.default)(function (args, callback) {
	        var result;
	        try {
	            result = func.apply(this, args);
	        } catch (e) {
	            return callback(e);
	        }
	        // if result is Promise object
	        if ((0, _isObject2.default)(result) && typeof result.then === 'function') {
	            result.then(function (value) {
	                invokeCallback(callback, null, value);
	            }, function (err) {
	                invokeCallback(callback, err.message ? err : new Error(err));
	            });
	        } else {
	            callback(null, result);
	        }
	    });
	}

	function invokeCallback(callback, error, value) {
	    try {
	        callback(error, value);
	    } catch (e) {
	        (0, _setImmediate2.default)(rethrow, e);
	    }
	}

	function rethrow(error) {
	    throw error;
	}
	module.exports = exports['default'];
	});

	var asyncify = unwrapExports(asyncify_1);

	var asyncify$1 = /*#__PURE__*/Object.freeze({
		default: asyncify,
		__moduleExports: asyncify_1
	});

	var _asyncify = ( asyncify$1 && asyncify ) || asyncify$1;

	var wrapAsync_1 = createCommonjsModule(function (module, exports) {

	Object.defineProperty(exports, "__esModule", {
	    value: true
	});
	exports.isAsync = undefined;



	var _asyncify2 = _interopRequireDefault(_asyncify);

	function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

	var supportsSymbol = typeof Symbol === 'function';

	function isAsync(fn) {
	    return supportsSymbol && fn[Symbol.toStringTag] === 'AsyncFunction';
	}

	function wrapAsync(asyncFn) {
	    return isAsync(asyncFn) ? (0, _asyncify2.default)(asyncFn) : asyncFn;
	}

	exports.default = wrapAsync;
	exports.isAsync = isAsync;
	});

	var wrapAsync = unwrapExports(wrapAsync_1);
	var wrapAsync_2 = wrapAsync_1.isAsync;

	var wrapAsync$1 = /*#__PURE__*/Object.freeze({
		default: wrapAsync,
		__moduleExports: wrapAsync_1,
		isAsync: wrapAsync_2
	});

	var _baseIndexOf$2 = ( _baseIndexOf$1 && _baseIndexOf ) || _baseIndexOf$1;

	var isArray$2 = ( isArray$1 && isArray_1 ) || isArray$1;

	var _noop = ( noop$1 && noop_1 ) || noop$1;

	var _onlyOnce = ( onlyOnce$1 && onlyOnce ) || onlyOnce$1;

	var _DoublyLinkedList = ( DoublyLinkedList$2 && DoublyLinkedList$1 ) || DoublyLinkedList$2;

	var _wrapAsync = ( wrapAsync$1 && wrapAsync ) || wrapAsync$1;

	var queue_1 = createCommonjsModule(function (module, exports) {

	Object.defineProperty(exports, "__esModule", {
	    value: true
	});
	exports.default = queue;



	var _baseIndexOf2 = _interopRequireDefault(_baseIndexOf$2);



	var _isArray2 = _interopRequireDefault(isArray$2);



	var _noop2 = _interopRequireDefault(_noop);



	var _onlyOnce2 = _interopRequireDefault(_onlyOnce);



	var _setImmediate2 = _interopRequireDefault(_setImmediate);



	var _DoublyLinkedList2 = _interopRequireDefault(_DoublyLinkedList);



	var _wrapAsync2 = _interopRequireDefault(_wrapAsync);

	function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

	function queue(worker, concurrency, payload) {
	    if (concurrency == null) {
	        concurrency = 1;
	    } else if (concurrency === 0) {
	        throw new Error('Concurrency must not be zero');
	    }

	    var _worker = (0, _wrapAsync2.default)(worker);
	    var numRunning = 0;
	    var workersList = [];

	    var processingScheduled = false;
	    function _insert(data, insertAtFront, callback) {
	        if (callback != null && typeof callback !== 'function') {
	            throw new Error('task callback must be a function');
	        }
	        q.started = true;
	        if (!(0, _isArray2.default)(data)) {
	            data = [data];
	        }
	        if (data.length === 0 && q.idle()) {
	            // call drain immediately if there are no tasks
	            return (0, _setImmediate2.default)(function () {
	                q.drain();
	            });
	        }

	        for (var i = 0, l = data.length; i < l; i++) {
	            var item = {
	                data: data[i],
	                callback: callback || _noop2.default
	            };

	            if (insertAtFront) {
	                q._tasks.unshift(item);
	            } else {
	                q._tasks.push(item);
	            }
	        }

	        if (!processingScheduled) {
	            processingScheduled = true;
	            (0, _setImmediate2.default)(function () {
	                processingScheduled = false;
	                q.process();
	            });
	        }
	    }

	    function _next(tasks) {
	        return function (err) {
	            var arguments$1 = arguments;

	            numRunning -= 1;

	            for (var i = 0, l = tasks.length; i < l; i++) {
	                var task = tasks[i];

	                var index = (0, _baseIndexOf2.default)(workersList, task, 0);
	                if (index === 0) {
	                    workersList.shift();
	                } else if (index > 0) {
	                    workersList.splice(index, 1);
	                }

	                task.callback.apply(task, arguments$1);

	                if (err != null) {
	                    q.error(err, task.data);
	                }
	            }

	            if (numRunning <= q.concurrency - q.buffer) {
	                q.unsaturated();
	            }

	            if (q.idle()) {
	                q.drain();
	            }
	            q.process();
	        };
	    }

	    var isProcessing = false;
	    var q = {
	        _tasks: new _DoublyLinkedList2.default(),
	        concurrency: concurrency,
	        payload: payload,
	        saturated: _noop2.default,
	        unsaturated: _noop2.default,
	        buffer: concurrency / 4,
	        empty: _noop2.default,
	        drain: _noop2.default,
	        error: _noop2.default,
	        started: false,
	        paused: false,
	        push: function (data, callback) {
	            _insert(data, false, callback);
	        },
	        kill: function () {
	            q.drain = _noop2.default;
	            q._tasks.empty();
	        },
	        unshift: function (data, callback) {
	            _insert(data, true, callback);
	        },
	        remove: function (testFn) {
	            q._tasks.remove(testFn);
	        },
	        process: function () {
	            // Avoid trying to start too many processing operations. This can occur
	            // when callbacks resolve synchronously (#1267).
	            if (isProcessing) {
	                return;
	            }
	            isProcessing = true;
	            while (!q.paused && numRunning < q.concurrency && q._tasks.length) {
	                var tasks = [],
	                    data = [];
	                var l = q._tasks.length;
	                if (q.payload) { l = Math.min(l, q.payload); }
	                for (var i = 0; i < l; i++) {
	                    var node = q._tasks.shift();
	                    tasks.push(node);
	                    workersList.push(node);
	                    data.push(node.data);
	                }

	                numRunning += 1;

	                if (q._tasks.length === 0) {
	                    q.empty();
	                }

	                if (numRunning === q.concurrency) {
	                    q.saturated();
	                }

	                var cb = (0, _onlyOnce2.default)(_next(tasks));
	                _worker(data, cb);
	            }
	            isProcessing = false;
	        },
	        length: function () {
	            return q._tasks.length;
	        },
	        running: function () {
	            return numRunning;
	        },
	        workersList: function () {
	            return workersList;
	        },
	        idle: function () {
	            return q._tasks.length + numRunning === 0;
	        },
	        pause: function () {
	            q.paused = true;
	        },
	        resume: function () {
	            if (q.paused === false) {
	                return;
	            }
	            q.paused = false;
	            (0, _setImmediate2.default)(q.process);
	        }
	    };
	    return q;
	}
	module.exports = exports['default'];
	});

	var queue = unwrapExports(queue_1);

	var queue$1 = /*#__PURE__*/Object.freeze({
		default: queue,
		__moduleExports: queue_1
	});

	var _queue = ( queue$1 && queue ) || queue$1;

	var queue$2 = createCommonjsModule(function (module, exports) {

	Object.defineProperty(exports, "__esModule", {
	  value: true
	});

	exports.default = function (worker, concurrency) {
	  var _worker = (0, _wrapAsync2.default)(worker);
	  return (0, _queue2.default)(function (items, cb) {
	    _worker(items[0], cb);
	  }, concurrency, 1);
	};



	var _queue2 = _interopRequireDefault(_queue);



	var _wrapAsync2 = _interopRequireDefault(_wrapAsync);

	function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

	module.exports = exports['default'];

	/**
	 * A queue of tasks for the worker function to complete.
	 * @typedef {Object} QueueObject
	 * @memberOf module:ControlFlow
	 * @property {Function} length - a function returning the number of items
	 * waiting to be processed. Invoke with `queue.length()`.
	 * @property {boolean} started - a boolean indicating whether or not any
	 * items have been pushed and processed by the queue.
	 * @property {Function} running - a function returning the number of items
	 * currently being processed. Invoke with `queue.running()`.
	 * @property {Function} workersList - a function returning the array of items
	 * currently being processed. Invoke with `queue.workersList()`.
	 * @property {Function} idle - a function returning false if there are items
	 * waiting or being processed, or true if not. Invoke with `queue.idle()`.
	 * @property {number} concurrency - an integer for determining how many `worker`
	 * functions should be run in parallel. This property can be changed after a
	 * `queue` is created to alter the concurrency on-the-fly.
	 * @property {Function} push - add a new task to the `queue`. Calls `callback`
	 * once the `worker` has finished processing the task. Instead of a single task,
	 * a `tasks` array can be submitted. The respective callback is used for every
	 * task in the list. Invoke with `queue.push(task, [callback])`,
	 * @property {Function} unshift - add a new task to the front of the `queue`.
	 * Invoke with `queue.unshift(task, [callback])`.
	 * @property {Function} remove - remove items from the queue that match a test
	 * function.  The test function will be passed an object with a `data` property,
	 * and a `priority` property, if this is a
	 * [priorityQueue]{@link module:ControlFlow.priorityQueue} object.
	 * Invoked with `queue.remove(testFn)`, where `testFn` is of the form
	 * `function ({data, priority}) {}` and returns a Boolean.
	 * @property {Function} saturated - a callback that is called when the number of
	 * running workers hits the `concurrency` limit, and further tasks will be
	 * queued.
	 * @property {Function} unsaturated - a callback that is called when the number
	 * of running workers is less than the `concurrency` & `buffer` limits, and
	 * further tasks will not be queued.
	 * @property {number} buffer - A minimum threshold buffer in order to say that
	 * the `queue` is `unsaturated`.
	 * @property {Function} empty - a callback that is called when the last item
	 * from the `queue` is given to a `worker`.
	 * @property {Function} drain - a callback that is called when the last item
	 * from the `queue` has returned from the `worker`.
	 * @property {Function} error - a callback that is called when a task errors.
	 * Has the signature `function(error, task)`.
	 * @property {boolean} paused - a boolean for determining whether the queue is
	 * in a paused state.
	 * @property {Function} pause - a function that pauses the processing of tasks
	 * until `resume()` is called. Invoke with `queue.pause()`.
	 * @property {Function} resume - a function that resumes the processing of
	 * queued tasks when the queue is paused. Invoke with `queue.resume()`.
	 * @property {Function} kill - a function that removes the `drain` callback and
	 * empties remaining tasks from the queue forcing it to go idle. No more tasks
	 * should be pushed to the queue after calling this function. Invoke with `queue.kill()`.
	 */

	/**
	 * Creates a `queue` object with the specified `concurrency`. Tasks added to the
	 * `queue` are processed in parallel (up to the `concurrency` limit). If all
	 * `worker`s are in progress, the task is queued until one becomes available.
	 * Once a `worker` completes a `task`, that `task`'s callback is called.
	 *
	 * @name queue
	 * @static
	 * @memberOf module:ControlFlow
	 * @method
	 * @category Control Flow
	 * @param {AsyncFunction} worker - An async function for processing a queued task.
	 * If you want to handle errors from an individual task, pass a callback to
	 * `q.push()`. Invoked with (task, callback).
	 * @param {number} [concurrency=1] - An `integer` for determining how many
	 * `worker` functions should be run in parallel.  If omitted, the concurrency
	 * defaults to `1`.  If the concurrency is `0`, an error is thrown.
	 * @returns {module:ControlFlow.QueueObject} A queue object to manage the tasks. Callbacks can
	 * attached as certain properties to listen for specific events during the
	 * lifecycle of the queue.
	 * @example
	 *
	 * // create a queue object with concurrency 2
	 * var q = async.queue(function(task, callback) {
	 *     console.log('hello ' + task.name);
	 *     callback();
	 * }, 2);
	 *
	 * // assign a callback
	 * q.drain = function() {
	 *     console.log('all items have been processed');
	 * };
	 *
	 * // add some items to the queue
	 * q.push({name: 'foo'}, function(err) {
	 *     console.log('finished processing foo');
	 * });
	 * q.push({name: 'bar'}, function (err) {
	 *     console.log('finished processing bar');
	 * });
	 *
	 * // add some items to the queue (batch-wise)
	 * q.push([{name: 'baz'},{name: 'bay'},{name: 'bax'}], function(err) {
	 *     console.log('finished processing item');
	 * });
	 *
	 * // add some items to the front of the queue
	 * q.unshift({name: 'bar'}, function (err) {
	 *     console.log('finished processing bar');
	 * });
	 */
	});

	var queue$3 = unwrapExports(queue$2);

	/** Detect free variable `global` from Node.js. */
	var freeGlobal = typeof commonjsGlobal == 'object' && commonjsGlobal && commonjsGlobal.Object === Object && commonjsGlobal;

	var _freeGlobal = freeGlobal;

	var _freeGlobal$1 = /*#__PURE__*/Object.freeze({
		default: _freeGlobal,
		__moduleExports: _freeGlobal
	});

	var freeGlobal$1 = ( _freeGlobal$1 && _freeGlobal ) || _freeGlobal$1;

	/** Detect free variable `self`. */
	var freeSelf = typeof self == 'object' && self && self.Object === Object && self;

	/** Used as a reference to the global object. */
	var root = freeGlobal$1 || freeSelf || Function('return this')();

	var _root = root;

	var _root$1 = /*#__PURE__*/Object.freeze({
		default: _root,
		__moduleExports: _root
	});

	var root$1 = ( _root$1 && _root ) || _root$1;

	/** Built-in value references. */
	var Symbol$1 = root$1.Symbol;

	var _Symbol = Symbol$1;

	var _Symbol$1 = /*#__PURE__*/Object.freeze({
		default: _Symbol,
		__moduleExports: _Symbol
	});

	var Symbol$2 = ( _Symbol$1 && _Symbol ) || _Symbol$1;

	/** Used for built-in method references. */
	var objectProto = Object.prototype;

	/** Used to check objects for own properties. */
	var hasOwnProperty = objectProto.hasOwnProperty;

	/**
	 * Used to resolve the
	 * [`toStringTag`](http://ecma-international.org/ecma-262/7.0/#sec-object.prototype.tostring)
	 * of values.
	 */
	var nativeObjectToString = objectProto.toString;

	/** Built-in value references. */
	var symToStringTag = Symbol$2 ? Symbol$2.toStringTag : undefined;

	/**
	 * A specialized version of `baseGetTag` which ignores `Symbol.toStringTag` values.
	 *
	 * @private
	 * @param {*} value The value to query.
	 * @returns {string} Returns the raw `toStringTag`.
	 */
	function getRawTag(value) {
	  var isOwn = hasOwnProperty.call(value, symToStringTag),
	      tag = value[symToStringTag];

	  try {
	    value[symToStringTag] = undefined;
	    var unmasked = true;
	  } catch (e) {}

	  var result = nativeObjectToString.call(value);
	  if (unmasked) {
	    if (isOwn) {
	      value[symToStringTag] = tag;
	    } else {
	      delete value[symToStringTag];
	    }
	  }
	  return result;
	}

	var _getRawTag = getRawTag;

	var _getRawTag$1 = /*#__PURE__*/Object.freeze({
		default: _getRawTag,
		__moduleExports: _getRawTag
	});

	/** Used for built-in method references. */
	var objectProto$1 = Object.prototype;

	/**
	 * Used to resolve the
	 * [`toStringTag`](http://ecma-international.org/ecma-262/7.0/#sec-object.prototype.tostring)
	 * of values.
	 */
	var nativeObjectToString$1 = objectProto$1.toString;

	/**
	 * Converts `value` to a string using `Object.prototype.toString`.
	 *
	 * @private
	 * @param {*} value The value to convert.
	 * @returns {string} Returns the converted string.
	 */
	function objectToString(value) {
	  return nativeObjectToString$1.call(value);
	}

	var _objectToString = objectToString;

	var _objectToString$1 = /*#__PURE__*/Object.freeze({
		default: _objectToString,
		__moduleExports: _objectToString
	});

	var getRawTag$1 = ( _getRawTag$1 && _getRawTag ) || _getRawTag$1;

	var objectToString$1 = ( _objectToString$1 && _objectToString ) || _objectToString$1;

	/** `Object#toString` result references. */
	var nullTag = '[object Null]',
	    undefinedTag = '[object Undefined]';

	/** Built-in value references. */
	var symToStringTag$1 = Symbol$2 ? Symbol$2.toStringTag : undefined;

	/**
	 * The base implementation of `getTag` without fallbacks for buggy environments.
	 *
	 * @private
	 * @param {*} value The value to query.
	 * @returns {string} Returns the `toStringTag`.
	 */
	function baseGetTag(value) {
	  if (value == null) {
	    return value === undefined ? undefinedTag : nullTag;
	  }
	  return (symToStringTag$1 && symToStringTag$1 in Object(value))
	    ? getRawTag$1(value)
	    : objectToString$1(value);
	}

	var _baseGetTag = baseGetTag;

	var _baseGetTag$1 = /*#__PURE__*/Object.freeze({
		default: _baseGetTag,
		__moduleExports: _baseGetTag
	});

	/**
	 * Checks if `value` is object-like. A value is object-like if it's not `null`
	 * and has a `typeof` result of "object".
	 *
	 * @static
	 * @memberOf _
	 * @since 4.0.0
	 * @category Lang
	 * @param {*} value The value to check.
	 * @returns {boolean} Returns `true` if `value` is object-like, else `false`.
	 * @example
	 *
	 * _.isObjectLike({});
	 * // => true
	 *
	 * _.isObjectLike([1, 2, 3]);
	 * // => true
	 *
	 * _.isObjectLike(_.noop);
	 * // => false
	 *
	 * _.isObjectLike(null);
	 * // => false
	 */
	function isObjectLike(value) {
	  return value != null && typeof value == 'object';
	}

	var isObjectLike_1 = isObjectLike;

	var isObjectLike$1 = /*#__PURE__*/Object.freeze({
		default: isObjectLike_1,
		__moduleExports: isObjectLike_1
	});

	var baseGetTag$1 = ( _baseGetTag$1 && _baseGetTag ) || _baseGetTag$1;

	var isObjectLike$2 = ( isObjectLike$1 && isObjectLike_1 ) || isObjectLike$1;

	/** `Object#toString` result references. */
	var symbolTag = '[object Symbol]';

	/**
	 * Checks if `value` is classified as a `Symbol` primitive or object.
	 *
	 * @static
	 * @memberOf _
	 * @since 4.0.0
	 * @category Lang
	 * @param {*} value The value to check.
	 * @returns {boolean} Returns `true` if `value` is a symbol, else `false`.
	 * @example
	 *
	 * _.isSymbol(Symbol.iterator);
	 * // => true
	 *
	 * _.isSymbol('abc');
	 * // => false
	 */
	function isSymbol(value) {
	  return typeof value == 'symbol' ||
	    (isObjectLike$2(value) && baseGetTag$1(value) == symbolTag);
	}

	var isSymbol_1 = isSymbol;

	var isSymbol$1 = /*#__PURE__*/Object.freeze({
		default: isSymbol_1,
		__moduleExports: isSymbol_1
	});

	var isSymbol$2 = ( isSymbol$1 && isSymbol_1 ) || isSymbol$1;

	/** Used to match property names within property paths. */
	var reIsDeepProp = /\.|\[(?:[^[\]]*|(["'])(?:(?!\1)[^\\]|\\.)*?\1)\]/,
	    reIsPlainProp = /^\w*$/;

	/**
	 * Checks if `value` is a property name and not a property path.
	 *
	 * @private
	 * @param {*} value The value to check.
	 * @param {Object} [object] The object to query keys on.
	 * @returns {boolean} Returns `true` if `value` is a property name, else `false`.
	 */
	function isKey(value, object) {
	  if (isArray$2(value)) {
	    return false;
	  }
	  var type = typeof value;
	  if (type == 'number' || type == 'symbol' || type == 'boolean' ||
	      value == null || isSymbol$2(value)) {
	    return true;
	  }
	  return reIsPlainProp.test(value) || !reIsDeepProp.test(value) ||
	    (object != null && value in Object(object));
	}

	var _isKey = isKey;

	var _isKey$1 = /*#__PURE__*/Object.freeze({
		default: _isKey,
		__moduleExports: _isKey
	});

	/** `Object#toString` result references. */
	var asyncTag = '[object AsyncFunction]',
	    funcTag = '[object Function]',
	    genTag = '[object GeneratorFunction]',
	    proxyTag = '[object Proxy]';

	/**
	 * Checks if `value` is classified as a `Function` object.
	 *
	 * @static
	 * @memberOf _
	 * @since 0.1.0
	 * @category Lang
	 * @param {*} value The value to check.
	 * @returns {boolean} Returns `true` if `value` is a function, else `false`.
	 * @example
	 *
	 * _.isFunction(_);
	 * // => true
	 *
	 * _.isFunction(/abc/);
	 * // => false
	 */
	function isFunction(value) {
	  if (!isObject$2(value)) {
	    return false;
	  }
	  // The use of `Object#toString` avoids issues with the `typeof` operator
	  // in Safari 9 which returns 'object' for typed arrays and other constructors.
	  var tag = baseGetTag$1(value);
	  return tag == funcTag || tag == genTag || tag == asyncTag || tag == proxyTag;
	}

	var isFunction_1 = isFunction;

	var isFunction$1 = /*#__PURE__*/Object.freeze({
		default: isFunction_1,
		__moduleExports: isFunction_1
	});

	/** Used to detect overreaching core-js shims. */
	var coreJsData = root$1['__core-js_shared__'];

	var _coreJsData = coreJsData;

	var _coreJsData$1 = /*#__PURE__*/Object.freeze({
		default: _coreJsData,
		__moduleExports: _coreJsData
	});

	var coreJsData$1 = ( _coreJsData$1 && _coreJsData ) || _coreJsData$1;

	/** Used to detect methods masquerading as native. */
	var maskSrcKey = (function() {
	  var uid = /[^.]+$/.exec(coreJsData$1 && coreJsData$1.keys && coreJsData$1.keys.IE_PROTO || '');
	  return uid ? ('Symbol(src)_1.' + uid) : '';
	}());

	/**
	 * Checks if `func` has its source masked.
	 *
	 * @private
	 * @param {Function} func The function to check.
	 * @returns {boolean} Returns `true` if `func` is masked, else `false`.
	 */
	function isMasked(func) {
	  return !!maskSrcKey && (maskSrcKey in func);
	}

	var _isMasked = isMasked;

	var _isMasked$1 = /*#__PURE__*/Object.freeze({
		default: _isMasked,
		__moduleExports: _isMasked
	});

	/** Used for built-in method references. */
	var funcProto = Function.prototype;

	/** Used to resolve the decompiled source of functions. */
	var funcToString = funcProto.toString;

	/**
	 * Converts `func` to its source code.
	 *
	 * @private
	 * @param {Function} func The function to convert.
	 * @returns {string} Returns the source code.
	 */
	function toSource(func) {
	  if (func != null) {
	    try {
	      return funcToString.call(func);
	    } catch (e) {}
	    try {
	      return (func + '');
	    } catch (e) {}
	  }
	  return '';
	}

	var _toSource = toSource;

	var _toSource$1 = /*#__PURE__*/Object.freeze({
		default: _toSource,
		__moduleExports: _toSource
	});

	var isFunction$2 = ( isFunction$1 && isFunction_1 ) || isFunction$1;

	var isMasked$1 = ( _isMasked$1 && _isMasked ) || _isMasked$1;

	var toSource$1 = ( _toSource$1 && _toSource ) || _toSource$1;

	/**
	 * Used to match `RegExp`
	 * [syntax characters](http://ecma-international.org/ecma-262/7.0/#sec-patterns).
	 */
	var reRegExpChar = /[\\^$.*+?()[\]{}|]/g;

	/** Used to detect host constructors (Safari). */
	var reIsHostCtor = /^\[object .+?Constructor\]$/;

	/** Used for built-in method references. */
	var funcProto$1 = Function.prototype,
	    objectProto$2 = Object.prototype;

	/** Used to resolve the decompiled source of functions. */
	var funcToString$1 = funcProto$1.toString;

	/** Used to check objects for own properties. */
	var hasOwnProperty$1 = objectProto$2.hasOwnProperty;

	/** Used to detect if a method is native. */
	var reIsNative = RegExp('^' +
	  funcToString$1.call(hasOwnProperty$1).replace(reRegExpChar, '\\$&')
	  .replace(/hasOwnProperty|(function).*?(?=\\\()| for .+?(?=\\\])/g, '$1.*?') + '$'
	);

	/**
	 * The base implementation of `_.isNative` without bad shim checks.
	 *
	 * @private
	 * @param {*} value The value to check.
	 * @returns {boolean} Returns `true` if `value` is a native function,
	 *  else `false`.
	 */
	function baseIsNative(value) {
	  if (!isObject$2(value) || isMasked$1(value)) {
	    return false;
	  }
	  var pattern = isFunction$2(value) ? reIsNative : reIsHostCtor;
	  return pattern.test(toSource$1(value));
	}

	var _baseIsNative = baseIsNative;

	var _baseIsNative$1 = /*#__PURE__*/Object.freeze({
		default: _baseIsNative,
		__moduleExports: _baseIsNative
	});

	/**
	 * Gets the value at `key` of `object`.
	 *
	 * @private
	 * @param {Object} [object] The object to query.
	 * @param {string} key The key of the property to get.
	 * @returns {*} Returns the property value.
	 */
	function getValue(object, key) {
	  return object == null ? undefined : object[key];
	}

	var _getValue = getValue;

	var _getValue$1 = /*#__PURE__*/Object.freeze({
		default: _getValue,
		__moduleExports: _getValue
	});

	var baseIsNative$1 = ( _baseIsNative$1 && _baseIsNative ) || _baseIsNative$1;

	var getValue$1 = ( _getValue$1 && _getValue ) || _getValue$1;

	/**
	 * Gets the native function at `key` of `object`.
	 *
	 * @private
	 * @param {Object} object The object to query.
	 * @param {string} key The key of the method to get.
	 * @returns {*} Returns the function if it's native, else `undefined`.
	 */
	function getNative(object, key) {
	  var value = getValue$1(object, key);
	  return baseIsNative$1(value) ? value : undefined;
	}

	var _getNative = getNative;

	var _getNative$1 = /*#__PURE__*/Object.freeze({
		default: _getNative,
		__moduleExports: _getNative
	});

	var getNative$1 = ( _getNative$1 && _getNative ) || _getNative$1;

	/* Built-in method references that are verified to be native. */
	var nativeCreate = getNative$1(Object, 'create');

	var _nativeCreate = nativeCreate;

	var _nativeCreate$1 = /*#__PURE__*/Object.freeze({
		default: _nativeCreate,
		__moduleExports: _nativeCreate
	});

	var nativeCreate$1 = ( _nativeCreate$1 && _nativeCreate ) || _nativeCreate$1;

	/**
	 * Removes all key-value entries from the hash.
	 *
	 * @private
	 * @name clear
	 * @memberOf Hash
	 */
	function hashClear() {
	  this.__data__ = nativeCreate$1 ? nativeCreate$1(null) : {};
	  this.size = 0;
	}

	var _hashClear = hashClear;

	var _hashClear$1 = /*#__PURE__*/Object.freeze({
		default: _hashClear,
		__moduleExports: _hashClear
	});

	/**
	 * Removes `key` and its value from the hash.
	 *
	 * @private
	 * @name delete
	 * @memberOf Hash
	 * @param {Object} hash The hash to modify.
	 * @param {string} key The key of the value to remove.
	 * @returns {boolean} Returns `true` if the entry was removed, else `false`.
	 */
	function hashDelete(key) {
	  var result = this.has(key) && delete this.__data__[key];
	  this.size -= result ? 1 : 0;
	  return result;
	}

	var _hashDelete = hashDelete;

	var _hashDelete$1 = /*#__PURE__*/Object.freeze({
		default: _hashDelete,
		__moduleExports: _hashDelete
	});

	/** Used to stand-in for `undefined` hash values. */
	var HASH_UNDEFINED = '__lodash_hash_undefined__';

	/** Used for built-in method references. */
	var objectProto$3 = Object.prototype;

	/** Used to check objects for own properties. */
	var hasOwnProperty$2 = objectProto$3.hasOwnProperty;

	/**
	 * Gets the hash value for `key`.
	 *
	 * @private
	 * @name get
	 * @memberOf Hash
	 * @param {string} key The key of the value to get.
	 * @returns {*} Returns the entry value.
	 */
	function hashGet(key) {
	  var data = this.__data__;
	  if (nativeCreate$1) {
	    var result = data[key];
	    return result === HASH_UNDEFINED ? undefined : result;
	  }
	  return hasOwnProperty$2.call(data, key) ? data[key] : undefined;
	}

	var _hashGet = hashGet;

	var _hashGet$1 = /*#__PURE__*/Object.freeze({
		default: _hashGet,
		__moduleExports: _hashGet
	});

	/** Used for built-in method references. */
	var objectProto$4 = Object.prototype;

	/** Used to check objects for own properties. */
	var hasOwnProperty$3 = objectProto$4.hasOwnProperty;

	/**
	 * Checks if a hash value for `key` exists.
	 *
	 * @private
	 * @name has
	 * @memberOf Hash
	 * @param {string} key The key of the entry to check.
	 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
	 */
	function hashHas(key) {
	  var data = this.__data__;
	  return nativeCreate$1 ? (data[key] !== undefined) : hasOwnProperty$3.call(data, key);
	}

	var _hashHas = hashHas;

	var _hashHas$1 = /*#__PURE__*/Object.freeze({
		default: _hashHas,
		__moduleExports: _hashHas
	});

	/** Used to stand-in for `undefined` hash values. */
	var HASH_UNDEFINED$1 = '__lodash_hash_undefined__';

	/**
	 * Sets the hash `key` to `value`.
	 *
	 * @private
	 * @name set
	 * @memberOf Hash
	 * @param {string} key The key of the value to set.
	 * @param {*} value The value to set.
	 * @returns {Object} Returns the hash instance.
	 */
	function hashSet(key, value) {
	  var data = this.__data__;
	  this.size += this.has(key) ? 0 : 1;
	  data[key] = (nativeCreate$1 && value === undefined) ? HASH_UNDEFINED$1 : value;
	  return this;
	}

	var _hashSet = hashSet;

	var _hashSet$1 = /*#__PURE__*/Object.freeze({
		default: _hashSet,
		__moduleExports: _hashSet
	});

	var hashClear$1 = ( _hashClear$1 && _hashClear ) || _hashClear$1;

	var hashDelete$1 = ( _hashDelete$1 && _hashDelete ) || _hashDelete$1;

	var hashGet$1 = ( _hashGet$1 && _hashGet ) || _hashGet$1;

	var hashHas$1 = ( _hashHas$1 && _hashHas ) || _hashHas$1;

	var hashSet$1 = ( _hashSet$1 && _hashSet ) || _hashSet$1;

	/**
	 * Creates a hash object.
	 *
	 * @private
	 * @constructor
	 * @param {Array} [entries] The key-value pairs to cache.
	 */
	function Hash(entries) {
	  var this$1 = this;

	  var index = -1,
	      length = entries == null ? 0 : entries.length;

	  this.clear();
	  while (++index < length) {
	    var entry = entries[index];
	    this$1.set(entry[0], entry[1]);
	  }
	}

	// Add methods to `Hash`.
	Hash.prototype.clear = hashClear$1;
	Hash.prototype['delete'] = hashDelete$1;
	Hash.prototype.get = hashGet$1;
	Hash.prototype.has = hashHas$1;
	Hash.prototype.set = hashSet$1;

	var _Hash = Hash;

	var _Hash$1 = /*#__PURE__*/Object.freeze({
		default: _Hash,
		__moduleExports: _Hash
	});

	/**
	 * Removes all key-value entries from the list cache.
	 *
	 * @private
	 * @name clear
	 * @memberOf ListCache
	 */
	function listCacheClear() {
	  this.__data__ = [];
	  this.size = 0;
	}

	var _listCacheClear = listCacheClear;

	var _listCacheClear$1 = /*#__PURE__*/Object.freeze({
		default: _listCacheClear,
		__moduleExports: _listCacheClear
	});

	/**
	 * Performs a
	 * [`SameValueZero`](http://ecma-international.org/ecma-262/7.0/#sec-samevaluezero)
	 * comparison between two values to determine if they are equivalent.
	 *
	 * @static
	 * @memberOf _
	 * @since 4.0.0
	 * @category Lang
	 * @param {*} value The value to compare.
	 * @param {*} other The other value to compare.
	 * @returns {boolean} Returns `true` if the values are equivalent, else `false`.
	 * @example
	 *
	 * var object = { 'a': 1 };
	 * var other = { 'a': 1 };
	 *
	 * _.eq(object, object);
	 * // => true
	 *
	 * _.eq(object, other);
	 * // => false
	 *
	 * _.eq('a', 'a');
	 * // => true
	 *
	 * _.eq('a', Object('a'));
	 * // => false
	 *
	 * _.eq(NaN, NaN);
	 * // => true
	 */
	function eq(value, other) {
	  return value === other || (value !== value && other !== other);
	}

	var eq_1 = eq;

	var eq$1 = /*#__PURE__*/Object.freeze({
		default: eq_1,
		__moduleExports: eq_1
	});

	var eq$2 = ( eq$1 && eq_1 ) || eq$1;

	/**
	 * Gets the index at which the `key` is found in `array` of key-value pairs.
	 *
	 * @private
	 * @param {Array} array The array to inspect.
	 * @param {*} key The key to search for.
	 * @returns {number} Returns the index of the matched value, else `-1`.
	 */
	function assocIndexOf(array, key) {
	  var length = array.length;
	  while (length--) {
	    if (eq$2(array[length][0], key)) {
	      return length;
	    }
	  }
	  return -1;
	}

	var _assocIndexOf = assocIndexOf;

	var _assocIndexOf$1 = /*#__PURE__*/Object.freeze({
		default: _assocIndexOf,
		__moduleExports: _assocIndexOf
	});

	var assocIndexOf$1 = ( _assocIndexOf$1 && _assocIndexOf ) || _assocIndexOf$1;

	/** Used for built-in method references. */
	var arrayProto = Array.prototype;

	/** Built-in value references. */
	var splice = arrayProto.splice;

	/**
	 * Removes `key` and its value from the list cache.
	 *
	 * @private
	 * @name delete
	 * @memberOf ListCache
	 * @param {string} key The key of the value to remove.
	 * @returns {boolean} Returns `true` if the entry was removed, else `false`.
	 */
	function listCacheDelete(key) {
	  var data = this.__data__,
	      index = assocIndexOf$1(data, key);

	  if (index < 0) {
	    return false;
	  }
	  var lastIndex = data.length - 1;
	  if (index == lastIndex) {
	    data.pop();
	  } else {
	    splice.call(data, index, 1);
	  }
	  --this.size;
	  return true;
	}

	var _listCacheDelete = listCacheDelete;

	var _listCacheDelete$1 = /*#__PURE__*/Object.freeze({
		default: _listCacheDelete,
		__moduleExports: _listCacheDelete
	});

	/**
	 * Gets the list cache value for `key`.
	 *
	 * @private
	 * @name get
	 * @memberOf ListCache
	 * @param {string} key The key of the value to get.
	 * @returns {*} Returns the entry value.
	 */
	function listCacheGet(key) {
	  var data = this.__data__,
	      index = assocIndexOf$1(data, key);

	  return index < 0 ? undefined : data[index][1];
	}

	var _listCacheGet = listCacheGet;

	var _listCacheGet$1 = /*#__PURE__*/Object.freeze({
		default: _listCacheGet,
		__moduleExports: _listCacheGet
	});

	/**
	 * Checks if a list cache value for `key` exists.
	 *
	 * @private
	 * @name has
	 * @memberOf ListCache
	 * @param {string} key The key of the entry to check.
	 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
	 */
	function listCacheHas(key) {
	  return assocIndexOf$1(this.__data__, key) > -1;
	}

	var _listCacheHas = listCacheHas;

	var _listCacheHas$1 = /*#__PURE__*/Object.freeze({
		default: _listCacheHas,
		__moduleExports: _listCacheHas
	});

	/**
	 * Sets the list cache `key` to `value`.
	 *
	 * @private
	 * @name set
	 * @memberOf ListCache
	 * @param {string} key The key of the value to set.
	 * @param {*} value The value to set.
	 * @returns {Object} Returns the list cache instance.
	 */
	function listCacheSet(key, value) {
	  var data = this.__data__,
	      index = assocIndexOf$1(data, key);

	  if (index < 0) {
	    ++this.size;
	    data.push([key, value]);
	  } else {
	    data[index][1] = value;
	  }
	  return this;
	}

	var _listCacheSet = listCacheSet;

	var _listCacheSet$1 = /*#__PURE__*/Object.freeze({
		default: _listCacheSet,
		__moduleExports: _listCacheSet
	});

	var listCacheClear$1 = ( _listCacheClear$1 && _listCacheClear ) || _listCacheClear$1;

	var listCacheDelete$1 = ( _listCacheDelete$1 && _listCacheDelete ) || _listCacheDelete$1;

	var listCacheGet$1 = ( _listCacheGet$1 && _listCacheGet ) || _listCacheGet$1;

	var listCacheHas$1 = ( _listCacheHas$1 && _listCacheHas ) || _listCacheHas$1;

	var listCacheSet$1 = ( _listCacheSet$1 && _listCacheSet ) || _listCacheSet$1;

	/**
	 * Creates an list cache object.
	 *
	 * @private
	 * @constructor
	 * @param {Array} [entries] The key-value pairs to cache.
	 */
	function ListCache(entries) {
	  var this$1 = this;

	  var index = -1,
	      length = entries == null ? 0 : entries.length;

	  this.clear();
	  while (++index < length) {
	    var entry = entries[index];
	    this$1.set(entry[0], entry[1]);
	  }
	}

	// Add methods to `ListCache`.
	ListCache.prototype.clear = listCacheClear$1;
	ListCache.prototype['delete'] = listCacheDelete$1;
	ListCache.prototype.get = listCacheGet$1;
	ListCache.prototype.has = listCacheHas$1;
	ListCache.prototype.set = listCacheSet$1;

	var _ListCache = ListCache;

	var _ListCache$1 = /*#__PURE__*/Object.freeze({
		default: _ListCache,
		__moduleExports: _ListCache
	});

	/* Built-in method references that are verified to be native. */
	var Map = getNative$1(root$1, 'Map');

	var _Map = Map;

	var _Map$1 = /*#__PURE__*/Object.freeze({
		default: _Map,
		__moduleExports: _Map
	});

	var Hash$1 = ( _Hash$1 && _Hash ) || _Hash$1;

	var ListCache$1 = ( _ListCache$1 && _ListCache ) || _ListCache$1;

	var Map$1 = ( _Map$1 && _Map ) || _Map$1;

	/**
	 * Removes all key-value entries from the map.
	 *
	 * @private
	 * @name clear
	 * @memberOf MapCache
	 */
	function mapCacheClear() {
	  this.size = 0;
	  this.__data__ = {
	    'hash': new Hash$1,
	    'map': new (Map$1 || ListCache$1),
	    'string': new Hash$1
	  };
	}

	var _mapCacheClear = mapCacheClear;

	var _mapCacheClear$1 = /*#__PURE__*/Object.freeze({
		default: _mapCacheClear,
		__moduleExports: _mapCacheClear
	});

	/**
	 * Checks if `value` is suitable for use as unique object key.
	 *
	 * @private
	 * @param {*} value The value to check.
	 * @returns {boolean} Returns `true` if `value` is suitable, else `false`.
	 */
	function isKeyable(value) {
	  var type = typeof value;
	  return (type == 'string' || type == 'number' || type == 'symbol' || type == 'boolean')
	    ? (value !== '__proto__')
	    : (value === null);
	}

	var _isKeyable = isKeyable;

	var _isKeyable$1 = /*#__PURE__*/Object.freeze({
		default: _isKeyable,
		__moduleExports: _isKeyable
	});

	var isKeyable$1 = ( _isKeyable$1 && _isKeyable ) || _isKeyable$1;

	/**
	 * Gets the data for `map`.
	 *
	 * @private
	 * @param {Object} map The map to query.
	 * @param {string} key The reference key.
	 * @returns {*} Returns the map data.
	 */
	function getMapData(map, key) {
	  var data = map.__data__;
	  return isKeyable$1(key)
	    ? data[typeof key == 'string' ? 'string' : 'hash']
	    : data.map;
	}

	var _getMapData = getMapData;

	var _getMapData$1 = /*#__PURE__*/Object.freeze({
		default: _getMapData,
		__moduleExports: _getMapData
	});

	var getMapData$1 = ( _getMapData$1 && _getMapData ) || _getMapData$1;

	/**
	 * Removes `key` and its value from the map.
	 *
	 * @private
	 * @name delete
	 * @memberOf MapCache
	 * @param {string} key The key of the value to remove.
	 * @returns {boolean} Returns `true` if the entry was removed, else `false`.
	 */
	function mapCacheDelete(key) {
	  var result = getMapData$1(this, key)['delete'](key);
	  this.size -= result ? 1 : 0;
	  return result;
	}

	var _mapCacheDelete = mapCacheDelete;

	var _mapCacheDelete$1 = /*#__PURE__*/Object.freeze({
		default: _mapCacheDelete,
		__moduleExports: _mapCacheDelete
	});

	/**
	 * Gets the map value for `key`.
	 *
	 * @private
	 * @name get
	 * @memberOf MapCache
	 * @param {string} key The key of the value to get.
	 * @returns {*} Returns the entry value.
	 */
	function mapCacheGet(key) {
	  return getMapData$1(this, key).get(key);
	}

	var _mapCacheGet = mapCacheGet;

	var _mapCacheGet$1 = /*#__PURE__*/Object.freeze({
		default: _mapCacheGet,
		__moduleExports: _mapCacheGet
	});

	/**
	 * Checks if a map value for `key` exists.
	 *
	 * @private
	 * @name has
	 * @memberOf MapCache
	 * @param {string} key The key of the entry to check.
	 * @returns {boolean} Returns `true` if an entry for `key` exists, else `false`.
	 */
	function mapCacheHas(key) {
	  return getMapData$1(this, key).has(key);
	}

	var _mapCacheHas = mapCacheHas;

	var _mapCacheHas$1 = /*#__PURE__*/Object.freeze({
		default: _mapCacheHas,
		__moduleExports: _mapCacheHas
	});

	/**
	 * Sets the map `key` to `value`.
	 *
	 * @private
	 * @name set
	 * @memberOf MapCache
	 * @param {string} key The key of the value to set.
	 * @param {*} value The value to set.
	 * @returns {Object} Returns the map cache instance.
	 */
	function mapCacheSet(key, value) {
	  var data = getMapData$1(this, key),
	      size = data.size;

	  data.set(key, value);
	  this.size += data.size == size ? 0 : 1;
	  return this;
	}

	var _mapCacheSet = mapCacheSet;

	var _mapCacheSet$1 = /*#__PURE__*/Object.freeze({
		default: _mapCacheSet,
		__moduleExports: _mapCacheSet
	});

	var mapCacheClear$1 = ( _mapCacheClear$1 && _mapCacheClear ) || _mapCacheClear$1;

	var mapCacheDelete$1 = ( _mapCacheDelete$1 && _mapCacheDelete ) || _mapCacheDelete$1;

	var mapCacheGet$1 = ( _mapCacheGet$1 && _mapCacheGet ) || _mapCacheGet$1;

	var mapCacheHas$1 = ( _mapCacheHas$1 && _mapCacheHas ) || _mapCacheHas$1;

	var mapCacheSet$1 = ( _mapCacheSet$1 && _mapCacheSet ) || _mapCacheSet$1;

	/**
	 * Creates a map cache object to store key-value pairs.
	 *
	 * @private
	 * @constructor
	 * @param {Array} [entries] The key-value pairs to cache.
	 */
	function MapCache(entries) {
	  var this$1 = this;

	  var index = -1,
	      length = entries == null ? 0 : entries.length;

	  this.clear();
	  while (++index < length) {
	    var entry = entries[index];
	    this$1.set(entry[0], entry[1]);
	  }
	}

	// Add methods to `MapCache`.
	MapCache.prototype.clear = mapCacheClear$1;
	MapCache.prototype['delete'] = mapCacheDelete$1;
	MapCache.prototype.get = mapCacheGet$1;
	MapCache.prototype.has = mapCacheHas$1;
	MapCache.prototype.set = mapCacheSet$1;

	var _MapCache = MapCache;

	var _MapCache$1 = /*#__PURE__*/Object.freeze({
		default: _MapCache,
		__moduleExports: _MapCache
	});

	var MapCache$1 = ( _MapCache$1 && _MapCache ) || _MapCache$1;

	/** Error message constants. */
	var FUNC_ERROR_TEXT = 'Expected a function';

	/**
	 * Creates a function that memoizes the result of `func`. If `resolver` is
	 * provided, it determines the cache key for storing the result based on the
	 * arguments provided to the memoized function. By default, the first argument
	 * provided to the memoized function is used as the map cache key. The `func`
	 * is invoked with the `this` binding of the memoized function.
	 *
	 * **Note:** The cache is exposed as the `cache` property on the memoized
	 * function. Its creation may be customized by replacing the `_.memoize.Cache`
	 * constructor with one whose instances implement the
	 * [`Map`](http://ecma-international.org/ecma-262/7.0/#sec-properties-of-the-map-prototype-object)
	 * method interface of `clear`, `delete`, `get`, `has`, and `set`.
	 *
	 * @static
	 * @memberOf _
	 * @since 0.1.0
	 * @category Function
	 * @param {Function} func The function to have its output memoized.
	 * @param {Function} [resolver] The function to resolve the cache key.
	 * @returns {Function} Returns the new memoized function.
	 * @example
	 *
	 * var object = { 'a': 1, 'b': 2 };
	 * var other = { 'c': 3, 'd': 4 };
	 *
	 * var values = _.memoize(_.values);
	 * values(object);
	 * // => [1, 2]
	 *
	 * values(other);
	 * // => [3, 4]
	 *
	 * object.a = 2;
	 * values(object);
	 * // => [1, 2]
	 *
	 * // Modify the result cache.
	 * values.cache.set(object, ['a', 'b']);
	 * values(object);
	 * // => ['a', 'b']
	 *
	 * // Replace `_.memoize.Cache`.
	 * _.memoize.Cache = WeakMap;
	 */
	function memoize(func, resolver) {
	  if (typeof func != 'function' || (resolver != null && typeof resolver != 'function')) {
	    throw new TypeError(FUNC_ERROR_TEXT);
	  }
	  var memoized = function() {
	    var args = arguments,
	        key = resolver ? resolver.apply(this, args) : args[0],
	        cache = memoized.cache;

	    if (cache.has(key)) {
	      return cache.get(key);
	    }
	    var result = func.apply(this, args);
	    memoized.cache = cache.set(key, result) || cache;
	    return result;
	  };
	  memoized.cache = new (memoize.Cache || MapCache$1);
	  return memoized;
	}

	// Expose `MapCache`.
	memoize.Cache = MapCache$1;

	var memoize_1 = memoize;

	var memoize$1 = /*#__PURE__*/Object.freeze({
		default: memoize_1,
		__moduleExports: memoize_1
	});

	var memoize$2 = ( memoize$1 && memoize_1 ) || memoize$1;

	/** Used as the maximum memoize cache size. */
	var MAX_MEMOIZE_SIZE = 500;

	/**
	 * A specialized version of `_.memoize` which clears the memoized function's
	 * cache when it exceeds `MAX_MEMOIZE_SIZE`.
	 *
	 * @private
	 * @param {Function} func The function to have its output memoized.
	 * @returns {Function} Returns the new memoized function.
	 */
	function memoizeCapped(func) {
	  var result = memoize$2(func, function(key) {
	    if (cache.size === MAX_MEMOIZE_SIZE) {
	      cache.clear();
	    }
	    return key;
	  });

	  var cache = result.cache;
	  return result;
	}

	var _memoizeCapped = memoizeCapped;

	var _memoizeCapped$1 = /*#__PURE__*/Object.freeze({
		default: _memoizeCapped,
		__moduleExports: _memoizeCapped
	});

	var memoizeCapped$1 = ( _memoizeCapped$1 && _memoizeCapped ) || _memoizeCapped$1;

	/** Used to match property names within property paths. */
	var rePropName = /[^.[\]]+|\[(?:(-?\d+(?:\.\d+)?)|(["'])((?:(?!\2)[^\\]|\\.)*?)\2)\]|(?=(?:\.|\[\])(?:\.|\[\]|$))/g;

	/** Used to match backslashes in property paths. */
	var reEscapeChar = /\\(\\)?/g;

	/**
	 * Converts `string` to a property path array.
	 *
	 * @private
	 * @param {string} string The string to convert.
	 * @returns {Array} Returns the property path array.
	 */
	var stringToPath = memoizeCapped$1(function(string) {
	  var result = [];
	  if (string.charCodeAt(0) === 46 /* . */) {
	    result.push('');
	  }
	  string.replace(rePropName, function(match, number, quote, subString) {
	    result.push(quote ? subString.replace(reEscapeChar, '$1') : (number || match));
	  });
	  return result;
	});

	var _stringToPath = stringToPath;

	var _stringToPath$1 = /*#__PURE__*/Object.freeze({
		default: _stringToPath,
		__moduleExports: _stringToPath
	});

	/**
	 * A specialized version of `_.map` for arrays without support for iteratee
	 * shorthands.
	 *
	 * @private
	 * @param {Array} [array] The array to iterate over.
	 * @param {Function} iteratee The function invoked per iteration.
	 * @returns {Array} Returns the new mapped array.
	 */
	function arrayMap(array, iteratee) {
	  var index = -1,
	      length = array == null ? 0 : array.length,
	      result = Array(length);

	  while (++index < length) {
	    result[index] = iteratee(array[index], index, array);
	  }
	  return result;
	}

	var _arrayMap = arrayMap;

	var _arrayMap$1 = /*#__PURE__*/Object.freeze({
		default: _arrayMap,
		__moduleExports: _arrayMap
	});

	var arrayMap$1 = ( _arrayMap$1 && _arrayMap ) || _arrayMap$1;

	/** Used as references for various `Number` constants. */
	var INFINITY = 1 / 0;

	/** Used to convert symbols to primitives and strings. */
	var symbolProto = Symbol$2 ? Symbol$2.prototype : undefined,
	    symbolToString = symbolProto ? symbolProto.toString : undefined;

	/**
	 * The base implementation of `_.toString` which doesn't convert nullish
	 * values to empty strings.
	 *
	 * @private
	 * @param {*} value The value to process.
	 * @returns {string} Returns the string.
	 */
	function baseToString(value) {
	  // Exit early for strings to avoid a performance hit in some environments.
	  if (typeof value == 'string') {
	    return value;
	  }
	  if (isArray$2(value)) {
	    // Recursively convert values (susceptible to call stack limits).
	    return arrayMap$1(value, baseToString) + '';
	  }
	  if (isSymbol$2(value)) {
	    return symbolToString ? symbolToString.call(value) : '';
	  }
	  var result = (value + '');
	  return (result == '0' && (1 / value) == -INFINITY) ? '-0' : result;
	}

	var _baseToString = baseToString;

	var _baseToString$1 = /*#__PURE__*/Object.freeze({
		default: _baseToString,
		__moduleExports: _baseToString
	});

	var baseToString$1 = ( _baseToString$1 && _baseToString ) || _baseToString$1;

	/**
	 * Converts `value` to a string. An empty string is returned for `null`
	 * and `undefined` values. The sign of `-0` is preserved.
	 *
	 * @static
	 * @memberOf _
	 * @since 4.0.0
	 * @category Lang
	 * @param {*} value The value to convert.
	 * @returns {string} Returns the converted string.
	 * @example
	 *
	 * _.toString(null);
	 * // => ''
	 *
	 * _.toString(-0);
	 * // => '-0'
	 *
	 * _.toString([1, 2, 3]);
	 * // => '1,2,3'
	 */
	function toString(value) {
	  return value == null ? '' : baseToString$1(value);
	}

	var toString_1 = toString;

	var toString$1 = /*#__PURE__*/Object.freeze({
		default: toString_1,
		__moduleExports: toString_1
	});

	var isKey$1 = ( _isKey$1 && _isKey ) || _isKey$1;

	var stringToPath$1 = ( _stringToPath$1 && _stringToPath ) || _stringToPath$1;

	var toString$2 = ( toString$1 && toString_1 ) || toString$1;

	/**
	 * Casts `value` to a path array if it's not one.
	 *
	 * @private
	 * @param {*} value The value to inspect.
	 * @param {Object} [object] The object to query keys on.
	 * @returns {Array} Returns the cast property path array.
	 */
	function castPath(value, object) {
	  if (isArray$2(value)) {
	    return value;
	  }
	  return isKey$1(value, object) ? [value] : stringToPath$1(toString$2(value));
	}

	var _castPath = castPath;

	var _castPath$1 = /*#__PURE__*/Object.freeze({
		default: _castPath,
		__moduleExports: _castPath
	});

	/** Used as references for various `Number` constants. */
	var INFINITY$1 = 1 / 0;

	/**
	 * Converts `value` to a string key if it's not a string or symbol.
	 *
	 * @private
	 * @param {*} value The value to inspect.
	 * @returns {string|symbol} Returns the key.
	 */
	function toKey(value) {
	  if (typeof value == 'string' || isSymbol$2(value)) {
	    return value;
	  }
	  var result = (value + '');
	  return (result == '0' && (1 / value) == -INFINITY$1) ? '-0' : result;
	}

	var _toKey = toKey;

	var _toKey$1 = /*#__PURE__*/Object.freeze({
		default: _toKey,
		__moduleExports: _toKey
	});

	var castPath$1 = ( _castPath$1 && _castPath ) || _castPath$1;

	var toKey$1 = ( _toKey$1 && _toKey ) || _toKey$1;

	/**
	 * The base implementation of `_.get` without support for default values.
	 *
	 * @private
	 * @param {Object} object The object to query.
	 * @param {Array|string} path The path of the property to get.
	 * @returns {*} Returns the resolved value.
	 */
	function baseGet(object, path) {
	  path = castPath$1(path, object);

	  var index = 0,
	      length = path.length;

	  while (object != null && index < length) {
	    object = object[toKey$1(path[index++])];
	  }
	  return (index && index == length) ? object : undefined;
	}

	var _baseGet = baseGet;

	var _baseGet$1 = /*#__PURE__*/Object.freeze({
		default: _baseGet,
		__moduleExports: _baseGet
	});

	var baseGet$1 = ( _baseGet$1 && _baseGet ) || _baseGet$1;

	/**
	 * Gets the value at `path` of `object`. If the resolved value is
	 * `undefined`, the `defaultValue` is returned in its place.
	 *
	 * @static
	 * @memberOf _
	 * @since 3.7.0
	 * @category Object
	 * @param {Object} object The object to query.
	 * @param {Array|string} path The path of the property to get.
	 * @param {*} [defaultValue] The value returned for `undefined` resolved values.
	 * @returns {*} Returns the resolved value.
	 * @example
	 *
	 * var object = { 'a': [{ 'b': { 'c': 3 } }] };
	 *
	 * _.get(object, 'a[0].b.c');
	 * // => 3
	 *
	 * _.get(object, ['a', '0', 'b', 'c']);
	 * // => 3
	 *
	 * _.get(object, 'a.b.c', 'default');
	 * // => 'default'
	 */
	function get(object, path, defaultValue) {
	  var result = object == null ? undefined : baseGet$1(object, path);
	  return result === undefined ? defaultValue : result;
	}

	var get_1 = get;

	var isImplemented = function () {
		var assign = Object.assign, obj;
		if (typeof assign !== "function") { return false; }
		obj = { foo: "raz" };
		assign(obj, { bar: "dwa" }, { trzy: "trzy" });
		return (obj.foo + obj.bar + obj.trzy) === "razdwatrzy";
	};

	var isImplemented$1 = /*#__PURE__*/Object.freeze({
		default: isImplemented,
		__moduleExports: isImplemented
	});

	var isImplemented$2 = function () {
		try {
			return true;
		} catch (e) {
	 return false;
	}
	};

	var isImplemented$3 = /*#__PURE__*/Object.freeze({
		default: isImplemented$2,
		__moduleExports: isImplemented$2
	});

	// eslint-disable-next-line no-empty-function
	var noop$2 = function () {};

	var noop$3 = /*#__PURE__*/Object.freeze({
		default: noop$2,
		__moduleExports: noop$2
	});

	var require$$0 = ( noop$3 && noop$2 ) || noop$3;

	var _undefined = require$$0(); // Support ES3 engines

	var isValue = function (val) {
	 return (val !== _undefined) && (val !== null);
	};

	var isValue$1 = /*#__PURE__*/Object.freeze({
		default: isValue,
		__moduleExports: isValue
	});

	var isValue$2 = ( isValue$1 && isValue ) || isValue$1;

	var keys = Object.keys;

	var shim = function (object) {
		return keys(isValue$2(object) ? Object(object) : object);
	};

	var shim$1 = /*#__PURE__*/Object.freeze({
		default: shim,
		__moduleExports: shim
	});

	var require$$0$1 = ( isImplemented$3 && isImplemented$2 ) || isImplemented$3;

	var require$$1 = ( shim$1 && shim ) || shim$1;

	var keys$1 = require$$0$1()
		? Object.keys
		: require$$1;

	var keys$2 = /*#__PURE__*/Object.freeze({
		default: keys$1,
		__moduleExports: keys$1
	});

	var validValue = function (value) {
		if (!isValue$2(value)) { throw new TypeError("Cannot use null or undefined"); }
		return value;
	};

	var validValue$1 = /*#__PURE__*/Object.freeze({
		default: validValue,
		__moduleExports: validValue
	});

	var keys$3 = ( keys$2 && keys$1 ) || keys$2;

	var value = ( validValue$1 && validValue ) || validValue$1;

	var max   = Math.max;

	var shim$2 = function (dest, src /*, …srcn*/) {
		var arguments$1 = arguments;

		var error, i, length = max(arguments.length, 2), assign;
		dest = Object(value(dest));
		assign = function (key) {
			try {
				dest[key] = src[key];
			} catch (e) {
				if (!error) { error = e; }
			}
		};
		for (i = 1; i < length; ++i) {
			src = arguments$1[i];
			keys$3(src).forEach(assign);
		}
		if (error !== undefined) { throw error; }
		return dest;
	};

	var shim$3 = /*#__PURE__*/Object.freeze({
		default: shim$2,
		__moduleExports: shim$2
	});

	var require$$0$2 = ( isImplemented$1 && isImplemented ) || isImplemented$1;

	var require$$1$1 = ( shim$3 && shim$2 ) || shim$3;

	var assign = require$$0$2()
		? Object.assign
		: require$$1$1;

	var assign$1 = /*#__PURE__*/Object.freeze({
		default: assign,
		__moduleExports: assign
	});

	var forEach = Array.prototype.forEach, create = Object.create;

	var process$1 = function (src, obj) {
		var key;
		for (key in src) { obj[key] = src[key]; }
	};

	// eslint-disable-next-line no-unused-vars
	var normalizeOptions = function (opts1 /*, …options*/) {
		var result = create(null);
		forEach.call(arguments, function (options) {
			if (!isValue$2(options)) { return; }
			process$1(Object(options), result);
		});
		return result;
	};

	var normalizeOptions$1 = /*#__PURE__*/Object.freeze({
		default: normalizeOptions,
		__moduleExports: normalizeOptions
	});

	// Deprecated

	var isCallable = function (obj) {
	 return typeof obj === "function";
	};

	var isCallable$1 = /*#__PURE__*/Object.freeze({
		default: isCallable,
		__moduleExports: isCallable
	});

	var str = "razdwatrzy";

	var isImplemented$4 = function () {
		if (typeof str.contains !== "function") { return false; }
		return (str.contains("dwa") === true) && (str.contains("foo") === false);
	};

	var isImplemented$5 = /*#__PURE__*/Object.freeze({
		default: isImplemented$4,
		__moduleExports: isImplemented$4
	});

	var indexOf = String.prototype.indexOf;

	var shim$4 = function (searchString/*, position*/) {
		return indexOf.call(this, searchString, arguments[1]) > -1;
	};

	var shim$5 = /*#__PURE__*/Object.freeze({
		default: shim$4,
		__moduleExports: shim$4
	});

	var require$$0$3 = ( isImplemented$5 && isImplemented$4 ) || isImplemented$5;

	var require$$1$2 = ( shim$5 && shim$4 ) || shim$5;

	var contains = require$$0$3()
		? String.prototype.contains
		: require$$1$2;

	var contains$1 = /*#__PURE__*/Object.freeze({
		default: contains,
		__moduleExports: contains
	});

	var assign$2 = ( assign$1 && assign ) || assign$1;

	var normalizeOpts = ( normalizeOptions$1 && normalizeOptions ) || normalizeOptions$1;

	var isCallable$2 = ( isCallable$1 && isCallable ) || isCallable$1;

	var contains$2 = ( contains$1 && contains ) || contains$1;

	var d_1 = createCommonjsModule(function (module) {

	var d;

	d = module.exports = function (dscr, value/*, options*/) {
		var c, e, w, options, desc;
		if ((arguments.length < 2) || (typeof dscr !== 'string')) {
			options = value;
			value = dscr;
			dscr = null;
		} else {
			options = arguments[2];
		}
		if (dscr == null) {
			c = w = true;
			e = false;
		} else {
			c = contains$2.call(dscr, 'c');
			e = contains$2.call(dscr, 'e');
			w = contains$2.call(dscr, 'w');
		}

		desc = { value: value, configurable: c, enumerable: e, writable: w };
		return !options ? desc : assign$2(normalizeOpts(options), desc);
	};

	d.gs = function (dscr, get, set/*, options*/) {
		var c, e, options, desc;
		if (typeof dscr !== 'string') {
			options = set;
			set = get;
			get = dscr;
			dscr = null;
		} else {
			options = arguments[3];
		}
		if (get == null) {
			get = undefined;
		} else if (!isCallable$2(get)) {
			options = get;
			get = set = undefined;
		} else if (set == null) {
			set = undefined;
		} else if (!isCallable$2(set)) {
			options = set;
			set = undefined;
		}
		if (dscr == null) {
			c = true;
			e = false;
		} else {
			c = contains$2.call(dscr, 'c');
			e = contains$2.call(dscr, 'e');
		}

		desc = { get: get, set: set, configurable: c, enumerable: e };
		return !options ? desc : assign$2(normalizeOpts(options), desc);
	};
	});

	var d = /*#__PURE__*/Object.freeze({
		default: d_1,
		__moduleExports: d_1
	});

	var validCallable = function (fn) {
		if (typeof fn !== "function") { throw new TypeError(fn + " is not a function"); }
		return fn;
	};

	var validCallable$1 = /*#__PURE__*/Object.freeze({
		default: validCallable,
		__moduleExports: validCallable
	});

	var d$1 = ( d && d_1 ) || d;

	var callable = ( validCallable$1 && validCallable ) || validCallable$1;

	var eventEmitter = createCommonjsModule(function (module, exports) {

	var apply = Function.prototype.apply, call = Function.prototype.call
	  , create = Object.create, defineProperty = Object.defineProperty
	  , defineProperties = Object.defineProperties
	  , hasOwnProperty = Object.prototype.hasOwnProperty
	  , descriptor = { configurable: true, enumerable: false, writable: true }

	  , on, once, off, emit, methods, descriptors, base;

	on = function (type, listener) {
		var data;

		callable(listener);

		if (!hasOwnProperty.call(this, '__ee__')) {
			data = descriptor.value = create(null);
			defineProperty(this, '__ee__', descriptor);
			descriptor.value = null;
		} else {
			data = this.__ee__;
		}
		if (!data[type]) { data[type] = listener; }
		else if (typeof data[type] === 'object') { data[type].push(listener); }
		else { data[type] = [data[type], listener]; }

		return this;
	};

	once = function (type, listener) {
		var once, self;

		callable(listener);
		self = this;
		on.call(this, type, once = function () {
			off.call(self, type, once);
			apply.call(listener, this, arguments);
		});

		once.__eeOnceListener__ = listener;
		return this;
	};

	off = function (type, listener) {
		var data, listeners, candidate, i;

		callable(listener);

		if (!hasOwnProperty.call(this, '__ee__')) { return this; }
		data = this.__ee__;
		if (!data[type]) { return this; }
		listeners = data[type];

		if (typeof listeners === 'object') {
			for (i = 0; (candidate = listeners[i]); ++i) {
				if ((candidate === listener) ||
						(candidate.__eeOnceListener__ === listener)) {
					if (listeners.length === 2) { data[type] = listeners[i ? 0 : 1]; }
					else { listeners.splice(i, 1); }
				}
			}
		} else {
			if ((listeners === listener) ||
					(listeners.__eeOnceListener__ === listener)) {
				delete data[type];
			}
		}

		return this;
	};

	emit = function (type) {
		var arguments$1 = arguments;
		var this$1 = this;

		var i, l, listener, listeners, args;

		if (!hasOwnProperty.call(this, '__ee__')) { return; }
		listeners = this.__ee__[type];
		if (!listeners) { return; }

		if (typeof listeners === 'object') {
			l = arguments.length;
			args = new Array(l - 1);
			for (i = 1; i < l; ++i) { args[i - 1] = arguments$1[i]; }

			listeners = listeners.slice();
			for (i = 0; (listener = listeners[i]); ++i) {
				apply.call(listener, this$1, args);
			}
		} else {
			switch (arguments.length) {
			case 1:
				call.call(listeners, this);
				break;
			case 2:
				call.call(listeners, this, arguments[1]);
				break;
			case 3:
				call.call(listeners, this, arguments[1], arguments[2]);
				break;
			default:
				l = arguments.length;
				args = new Array(l - 1);
				for (i = 1; i < l; ++i) {
					args[i - 1] = arguments$1[i];
				}
				apply.call(listeners, this, args);
			}
		}
	};

	methods = {
		on: on,
		once: once,
		off: off,
		emit: emit
	};

	descriptors = {
		on: d$1(on),
		once: d$1(once),
		off: d$1(off),
		emit: d$1(emit)
	};

	base = defineProperties({}, descriptors);

	module.exports = exports = function (o) {
		return (o == null) ? create(base) : defineProperties(Object(o), descriptors);
	};
	exports.methods = methods;
	});
	var eventEmitter_1 = eventEmitter.methods;

	var NetFactorDefault = (function (Component$$1) {
	  function NetFactorDefault(props) {
	    var this$1 = this;

	    Component$$1.call(this, props);
	    var eventEmitter = props.eventEmitter;

	    var total = 0;
	    var ocorrencias = 0;
	    var recebidos = 0;
	    var naoRecebidos = 0;

	    eventEmitter.on('init', function () {
	      total += 1;
	      naoRecebidos += 1;
	      this$1.setState({
	        total: total,
	        ocorrencias: ocorrencias,
	        recebidos: recebidos,
	        naoRecebidos: naoRecebidos,
	      });
	    });

	    eventEmitter.on('done', function (ctx) {
	      naoRecebidos -= 1;
	      recebidos += 1;
	      ocorrencias += (ctx.props.protesto || ctx.props.ccf
	        || ctx.props.queryStatus !== 1) ? 1 : 0;
	      this$1.setState({
	        total: total,
	        ocorrencias: ocorrencias,
	        recebidos: recebidos,
	        naoRecebidos: naoRecebidos,
	      });
	    });
	  }

	  if ( Component$$1 ) NetFactorDefault.__proto__ = Component$$1;
	  NetFactorDefault.prototype = Object.create( Component$$1 && Component$$1.prototype );
	  NetFactorDefault.prototype.constructor = NetFactorDefault;

	  NetFactorDefault.prototype.render = function render$$1 (props, ref) {
	    var total = ref.total;
	    var ocorrencias = ref.ocorrencias;
	    var recebidos = ref.recebidos;
	    var naoRecebidos = ref.naoRecebidos;

	    return (h( 'table', { width: "450", align: "center", border: "0", className: "tteladedados" },
	      h( 'thead', null,
	        h( 'tr', null, h( 'th', { colSpan: "8" }, "Resumo dos Cheques: ") )
	      ),
	      h( 'tbody', null,
	        h( 'tr', null,
	          h( 'td', { nowrap: "" }, h( 'b', null, "Total de Cheques : ", total || 0 )),
	          h( 'td', { nowrap: "" }, h( 'b', null, "Ocorrências: ", ocorrencias || 0 ))
	        ),
	        h( 'tr', null,
	          h( 'td', { nowrap: "" }, h( 'b', null, "Recebidos : ", recebidos || 0 )),
	          h( 'td', { nowrap: "" }, h( 'b', null, "Não Recebidos: ", naoRecebidos || 0 ))
	        )
	      )
	    ));
	  };

	  return NetFactorDefault;
	}(Component));

	function IChequesInformation (ref) {
	  var name = ref.name;
	  var value = ref.value;

	  return (h( 'tr', { bgcolor: "transparent" },
	  h( 'td', { colSpan: "8" },
	    h( 'div', { style: { display: 'block' } },
	      h( 'table', { width: "100%", border: "0", bgcolor: "transparent" },
	        h( 'tbody', null,
	          h( 'tr', { style: { backgroundColor: 'transparent' } },
	            h( 'td', { width: "2%" }, h( 'img', { src: "/netFactor/images/quebra.gif", alt: "#", border: "0" })),
	            h( 'td', null, h( 'b', null, name ) )
	          ),
	          h( 'tr', { style: { backgroundColor: 'transparent' } },
	            h( 'td', { colSpan: "5" }, value)
	          )
	        )
	      )
	    )
	  )
	));
	}

	var iCheques = new ICheques(window.apiKey);

	var q = queue$3(function (content, callback) {
	  var valor = content.valor;
	  var vencimento = content.vencimento;
	  var cmc = content.cmc;
	  var documento = content.documento;
	  var currentNode = content.currentNode;
	  try {
	    iCheques.chequeLegal(valor, vencimento, cmc, documento)
	      .then(function (props) { return callback(null, { props: props, currentNode: currentNode }); })
	      .catch(function (error) { return callback(null, { error: error, currentNode: currentNode }); });
	  } catch (error) {
	    callback(null, { error: error, currentNode: currentNode });
	  }
	}, 2);

	var cmc7Regex = /(\d{7})(\d{1})(\d{10})(\d{1})(\d{10})(\d{1})/;

	var element;
	function sendChecks() {
	  if (element) {
	    element.parentNode.removeChild(element);
	  }

	  var eventEmitter$$1 = new eventEmitter();
	  var consultaElement = document.getElementById('consulta');

	  element = render(h(NetFactorDefault, { eventEmitter: eventEmitter$$1 }), consultaElement);
	  consultaElement.insertBefore(element, consultaElement.firstChild);

	  var walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null, false);
	  var n;

	  var loop = function () {

	    if (!cmc7Regex.test(n.nodeValue)) { return; }

	    if (!n.parentNode.parentNode.getElementsByClassName('ObInputCheckBox').item(0).checked) {
	      return;
	    }

	    var object = {
	      currentNode: n.parentNode.parentNode,
	      cmc: get_1(n, 'nodeValue'),
	      vencimento: new Date(get_1(n, 'parentNode.previousElementSibling.textContent').split('/').reverse().join()),
	      valor: parseFloat(get_1(n, 'parentNode.previousElementSibling.previousElementSibling.textContent', '0').replace('.', '').replace(',', '.')),
	      documento: get_1(n, 'parentNode.previousElementSibling.previousElementSibling.previousElementSibling.textContent'),
	    };

	    eventEmitter$$1.emit('init', { object: object });

	    q.push(object, function (err, ref) {
	      var props = ref.props;
	      var error = ref.error;
	      var currentNode = ref.currentNode;


	      if (error) {
	        var errorContent = render(h(IChequesInformation, {
	          name: 'Erro', value: error.message.toString(),
	        }), document.body);
	        currentNode.parentNode.insertBefore(errorContent, currentNode.nextElementSibling);
	        return;
	      }

	      eventEmitter$$1.emit('done', { object: object, props: props });

	      var ccfContent = render(h(IChequesInformation, {
	        name: 'Cheques sem Fundo',
	        value: props.ccf ?
	          ("Localizamos " + (props.ccf) + " cheque(s) sem fundos.") :
	          'Não existem cheques sem fundos.',
	      }), document.body);

	      currentNode.parentNode.insertBefore(ccfContent, currentNode.nextElementSibling);

	      var protestoContent = render(h(IChequesInformation, {
	        name: 'Protestos',
	        value: props.protesto ?
	          ("Localizamos " + (props.protesto) + " protesto(s).") :
	          'Não existem protestos (IEPTB).',
	      }), document.body);

	      currentNode.parentNode.insertBefore(protestoContent, currentNode.nextElementSibling);

	      var displayContent = render(h(IChequesInformation, {
	        name: 'Situação do Cheque', value: props.display.toString(),
	      }), document.body);
	      currentNode.parentNode.insertBefore(displayContent, currentNode.nextElementSibling);
	    });

	  };

	  while (n = walk.nextNode()) loop();
	}

	return sendChecks;

})));
