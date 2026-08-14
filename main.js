"use strict";
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __commonJS = (cb, mod) => function __require() {
  try {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  } catch (e) {
    throw mod = 0, e;
  }
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(
  // If the importer is in node compatibility mode or this is not an ESM
  // file that has been converted to a CommonJS file using a Babel-
  // compatible transform (i.e. "__esModule" has not been set), then set
  // "default" to the CommonJS "module.exports" for node compatibility.
  isNodeMode || !mod || !mod.__esModule ? __defProp(target, "default", { value: mod, enumerable: true }) : target,
  mod
));
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

// ../../node_modules/.pnpm/ws@8.21.2/node_modules/ws/lib/constants.js
var require_constants = __commonJS({
  "../../node_modules/.pnpm/ws@8.21.2/node_modules/ws/lib/constants.js"(exports2, module2) {
    "use strict";
    var BINARY_TYPES = ["nodebuffer", "arraybuffer", "fragments"];
    var hasBlob = typeof Blob !== "undefined";
    if (hasBlob) BINARY_TYPES.push("blob");
    module2.exports = {
      BINARY_TYPES,
      CLOSE_TIMEOUT: 3e4,
      EMPTY_BUFFER: Buffer.alloc(0),
      GUID: "258EAFA5-E914-47DA-95CA-C5AB0DC85B11",
      hasBlob,
      kForOnEventAttribute: /* @__PURE__ */ Symbol("kIsForOnEventAttribute"),
      kListener: /* @__PURE__ */ Symbol("kListener"),
      kStatusCode: /* @__PURE__ */ Symbol("status-code"),
      kWebSocket: /* @__PURE__ */ Symbol("websocket"),
      NOOP: () => {
      }
    };
  }
});

// ../../node_modules/.pnpm/ws@8.21.2/node_modules/ws/lib/buffer-util.js
var require_buffer_util = __commonJS({
  "../../node_modules/.pnpm/ws@8.21.2/node_modules/ws/lib/buffer-util.js"(exports2, module2) {
    "use strict";
    var { EMPTY_BUFFER } = require_constants();
    var FastBuffer = Buffer[Symbol.species];
    function concat(list, totalLength) {
      if (list.length === 0) return EMPTY_BUFFER;
      if (list.length === 1) return list[0];
      const target = Buffer.allocUnsafe(totalLength);
      let offset = 0;
      for (let i = 0; i < list.length; i++) {
        const buf = list[i];
        target.set(buf, offset);
        offset += buf.length;
      }
      if (offset < totalLength) {
        return new FastBuffer(target.buffer, target.byteOffset, offset);
      }
      return target;
    }
    function _mask(source, mask, output, offset, length) {
      for (let i = 0; i < length; i++) {
        output[offset + i] = source[i] ^ mask[i & 3];
      }
    }
    function _unmask(buffer, mask) {
      for (let i = 0; i < buffer.length; i++) {
        buffer[i] ^= mask[i & 3];
      }
    }
    function toArrayBuffer(buf) {
      if (buf.length === buf.buffer.byteLength) {
        return buf.buffer;
      }
      return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length);
    }
    function toBuffer(data) {
      toBuffer.readOnly = true;
      if (Buffer.isBuffer(data)) return data;
      let buf;
      if (data instanceof ArrayBuffer) {
        buf = new FastBuffer(data);
      } else if (ArrayBuffer.isView(data)) {
        buf = new FastBuffer(data.buffer, data.byteOffset, data.byteLength);
      } else {
        buf = Buffer.from(data);
        toBuffer.readOnly = false;
      }
      return buf;
    }
    module2.exports = {
      concat,
      mask: _mask,
      toArrayBuffer,
      toBuffer,
      unmask: _unmask
    };
    if (!process.env.WS_NO_BUFFER_UTIL) {
      try {
        const bufferUtil = require("bufferutil");
        module2.exports.mask = function(source, mask, output, offset, length) {
          if (length < 48) _mask(source, mask, output, offset, length);
          else bufferUtil.mask(source, mask, output, offset, length);
        };
        module2.exports.unmask = function(buffer, mask) {
          if (buffer.length < 32) _unmask(buffer, mask);
          else bufferUtil.unmask(buffer, mask);
        };
      } catch (e) {
      }
    }
  }
});

// ../../node_modules/.pnpm/ws@8.21.2/node_modules/ws/lib/limiter.js
var require_limiter = __commonJS({
  "../../node_modules/.pnpm/ws@8.21.2/node_modules/ws/lib/limiter.js"(exports2, module2) {
    "use strict";
    var kDone = /* @__PURE__ */ Symbol("kDone");
    var kRun = /* @__PURE__ */ Symbol("kRun");
    var Limiter = class {
      /**
       * Creates a new `Limiter`.
       *
       * @param {Number} [concurrency=Infinity] The maximum number of jobs allowed
       *     to run concurrently
       */
      constructor(concurrency) {
        this[kDone] = () => {
          this.pending--;
          this[kRun]();
        };
        this.concurrency = concurrency || Infinity;
        this.jobs = [];
        this.pending = 0;
      }
      /**
       * Adds a job to the queue.
       *
       * @param {Function} job The job to run
       * @public
       */
      add(job) {
        this.jobs.push(job);
        this[kRun]();
      }
      /**
       * Removes a job from the queue and runs it if possible.
       *
       * @private
       */
      [kRun]() {
        if (this.pending === this.concurrency) return;
        if (this.jobs.length) {
          const job = this.jobs.shift();
          this.pending++;
          job(this[kDone]);
        }
      }
    };
    module2.exports = Limiter;
  }
});

// ../../node_modules/.pnpm/ws@8.21.2/node_modules/ws/lib/permessage-deflate.js
var require_permessage_deflate = __commonJS({
  "../../node_modules/.pnpm/ws@8.21.2/node_modules/ws/lib/permessage-deflate.js"(exports2, module2) {
    "use strict";
    var zlib = require("zlib");
    var bufferUtil = require_buffer_util();
    var Limiter = require_limiter();
    var { kStatusCode } = require_constants();
    var FastBuffer = Buffer[Symbol.species];
    var TRAILER = Buffer.from([0, 0, 255, 255]);
    var kPerMessageDeflate = /* @__PURE__ */ Symbol("permessage-deflate");
    var kTotalLength = /* @__PURE__ */ Symbol("total-length");
    var kCallback = /* @__PURE__ */ Symbol("callback");
    var kBuffers = /* @__PURE__ */ Symbol("buffers");
    var kError = /* @__PURE__ */ Symbol("error");
    var zlibLimiter;
    var PerMessageDeflate2 = class {
      /**
       * Creates a PerMessageDeflate instance.
       *
       * @param {Object} [options] Configuration options
       * @param {(Boolean|Number)} [options.clientMaxWindowBits] Advertise support
       *     for, or request, a custom client window size
       * @param {Boolean} [options.clientNoContextTakeover=false] Advertise/
       *     acknowledge disabling of client context takeover
       * @param {Number} [options.concurrencyLimit=10] The number of concurrent
       *     calls to zlib
       * @param {Boolean} [options.isServer=false] Create the instance in either
       *     server or client mode
       * @param {Number} [options.maxPayload=0] The maximum allowed message length
       * @param {(Boolean|Number)} [options.serverMaxWindowBits] Request/confirm the
       *     use of a custom server window size
       * @param {Boolean} [options.serverNoContextTakeover=false] Request/accept
       *     disabling of server context takeover
       * @param {Number} [options.threshold=1024] Size (in bytes) below which
       *     messages should not be compressed if context takeover is disabled
       * @param {Object} [options.zlibDeflateOptions] Options to pass to zlib on
       *     deflate
       * @param {Object} [options.zlibInflateOptions] Options to pass to zlib on
       *     inflate
       */
      constructor(options) {
        this._options = options || {};
        this._threshold = this._options.threshold !== void 0 ? this._options.threshold : 1024;
        this._maxPayload = this._options.maxPayload | 0;
        this._isServer = !!this._options.isServer;
        this._deflate = null;
        this._inflate = null;
        this.params = null;
        if (!zlibLimiter) {
          const concurrency = this._options.concurrencyLimit !== void 0 ? this._options.concurrencyLimit : 10;
          zlibLimiter = new Limiter(concurrency);
        }
      }
      /**
       * @type {String}
       */
      static get extensionName() {
        return "permessage-deflate";
      }
      /**
       * Create an extension negotiation offer.
       *
       * @return {Object} Extension parameters
       * @public
       */
      offer() {
        const params = {};
        if (this._options.serverNoContextTakeover) {
          params.server_no_context_takeover = true;
        }
        if (this._options.clientNoContextTakeover) {
          params.client_no_context_takeover = true;
        }
        if (this._options.serverMaxWindowBits) {
          params.server_max_window_bits = this._options.serverMaxWindowBits;
        }
        if (this._options.clientMaxWindowBits) {
          params.client_max_window_bits = this._options.clientMaxWindowBits;
        } else if (this._options.clientMaxWindowBits == null) {
          params.client_max_window_bits = true;
        }
        return params;
      }
      /**
       * Accept an extension negotiation offer/response.
       *
       * @param {Array} configurations The extension negotiation offers/reponse
       * @return {Object} Accepted configuration
       * @public
       */
      accept(configurations) {
        configurations = this.normalizeParams(configurations);
        this.params = this._isServer ? this.acceptAsServer(configurations) : this.acceptAsClient(configurations);
        return this.params;
      }
      /**
       * Releases all resources used by the extension.
       *
       * @public
       */
      cleanup() {
        if (this._inflate) {
          this._inflate.close();
          this._inflate = null;
        }
        if (this._deflate) {
          const callback = this._deflate[kCallback];
          this._deflate.close();
          this._deflate = null;
          if (callback) {
            callback(
              new Error(
                "The deflate stream was closed while data was being processed"
              )
            );
          }
        }
      }
      /**
       *  Accept an extension negotiation offer.
       *
       * @param {Array} offers The extension negotiation offers
       * @return {Object} Accepted configuration
       * @private
       */
      acceptAsServer(offers) {
        const opts = this._options;
        const accepted = offers.find((params) => {
          if (opts.serverNoContextTakeover === false && params.server_no_context_takeover || params.server_max_window_bits && (opts.serverMaxWindowBits === false || typeof opts.serverMaxWindowBits === "number" && opts.serverMaxWindowBits > params.server_max_window_bits) || typeof opts.clientMaxWindowBits === "number" && !params.client_max_window_bits) {
            return false;
          }
          return true;
        });
        if (!accepted) {
          throw new Error("None of the extension offers can be accepted");
        }
        if (opts.serverNoContextTakeover) {
          accepted.server_no_context_takeover = true;
        }
        if (opts.clientNoContextTakeover) {
          accepted.client_no_context_takeover = true;
        }
        if (typeof opts.serverMaxWindowBits === "number") {
          accepted.server_max_window_bits = opts.serverMaxWindowBits;
        }
        if (typeof opts.clientMaxWindowBits === "number") {
          accepted.client_max_window_bits = opts.clientMaxWindowBits;
        } else if (accepted.client_max_window_bits === true || opts.clientMaxWindowBits === false) {
          delete accepted.client_max_window_bits;
        }
        return accepted;
      }
      /**
       * Accept the extension negotiation response.
       *
       * @param {Array} response The extension negotiation response
       * @return {Object} Accepted configuration
       * @private
       */
      acceptAsClient(response) {
        const params = response[0];
        if (this._options.clientNoContextTakeover === false && params.client_no_context_takeover) {
          throw new Error('Unexpected parameter "client_no_context_takeover"');
        }
        if (!params.client_max_window_bits) {
          if (typeof this._options.clientMaxWindowBits === "number") {
            params.client_max_window_bits = this._options.clientMaxWindowBits;
          }
        } else if (this._options.clientMaxWindowBits === false || typeof this._options.clientMaxWindowBits === "number" && params.client_max_window_bits > this._options.clientMaxWindowBits) {
          throw new Error(
            'Unexpected or invalid parameter "client_max_window_bits"'
          );
        }
        return params;
      }
      /**
       * Normalize parameters.
       *
       * @param {Array} configurations The extension negotiation offers/reponse
       * @return {Array} The offers/response with normalized parameters
       * @private
       */
      normalizeParams(configurations) {
        configurations.forEach((params) => {
          Object.keys(params).forEach((key) => {
            let value = params[key];
            if (value.length > 1) {
              throw new Error(`Parameter "${key}" must have only a single value`);
            }
            value = value[0];
            if (key === "client_max_window_bits") {
              if (value !== true) {
                const num = +value;
                if (!Number.isInteger(num) || num < 8 || num > 15) {
                  throw new TypeError(
                    `Invalid value for parameter "${key}": ${value}`
                  );
                }
                value = num;
              } else if (!this._isServer) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
            } else if (key === "server_max_window_bits") {
              const num = +value;
              if (!Number.isInteger(num) || num < 8 || num > 15) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
              value = num;
            } else if (key === "client_no_context_takeover" || key === "server_no_context_takeover") {
              if (value !== true) {
                throw new TypeError(
                  `Invalid value for parameter "${key}": ${value}`
                );
              }
            } else {
              throw new Error(`Unknown parameter "${key}"`);
            }
            params[key] = value;
          });
        });
        return configurations;
      }
      /**
       * Decompress data. Concurrency limited.
       *
       * @param {Buffer} data Compressed data
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @public
       */
      decompress(data, fin, callback) {
        zlibLimiter.add((done) => {
          this._decompress(data, fin, (err, result) => {
            done();
            callback(err, result);
          });
        });
      }
      /**
       * Compress data. Concurrency limited.
       *
       * @param {(Buffer|String)} data Data to compress
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @public
       */
      compress(data, fin, callback) {
        zlibLimiter.add((done) => {
          this._compress(data, fin, (err, result) => {
            done();
            callback(err, result);
          });
        });
      }
      /**
       * Decompress data.
       *
       * @param {Buffer} data Compressed data
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @private
       */
      _decompress(data, fin, callback) {
        const endpoint = this._isServer ? "client" : "server";
        if (!this._inflate) {
          const key = `${endpoint}_max_window_bits`;
          const windowBits = typeof this.params[key] !== "number" ? zlib.Z_DEFAULT_WINDOWBITS : this.params[key];
          this._inflate = zlib.createInflateRaw({
            ...this._options.zlibInflateOptions,
            windowBits
          });
          this._inflate[kPerMessageDeflate] = this;
          this._inflate[kTotalLength] = 0;
          this._inflate[kBuffers] = [];
          this._inflate.on("error", inflateOnError);
          this._inflate.on("data", inflateOnData);
        }
        this._inflate[kCallback] = callback;
        this._inflate.write(data);
        if (fin) this._inflate.write(TRAILER);
        this._inflate.flush(() => {
          const err = this._inflate[kError];
          if (err) {
            this._inflate.close();
            this._inflate = null;
            callback(err);
            return;
          }
          const data2 = bufferUtil.concat(
            this._inflate[kBuffers],
            this._inflate[kTotalLength]
          );
          if (this._inflate._readableState.endEmitted) {
            this._inflate.close();
            this._inflate = null;
          } else {
            this._inflate[kTotalLength] = 0;
            this._inflate[kBuffers] = [];
            if (fin && this.params[`${endpoint}_no_context_takeover`]) {
              this._inflate.reset();
            }
          }
          callback(null, data2);
        });
      }
      /**
       * Compress data.
       *
       * @param {(Buffer|String)} data Data to compress
       * @param {Boolean} fin Specifies whether or not this is the last fragment
       * @param {Function} callback Callback
       * @private
       */
      _compress(data, fin, callback) {
        const endpoint = this._isServer ? "server" : "client";
        if (!this._deflate) {
          const key = `${endpoint}_max_window_bits`;
          const windowBits = typeof this.params[key] !== "number" ? zlib.Z_DEFAULT_WINDOWBITS : this.params[key];
          this._deflate = zlib.createDeflateRaw({
            ...this._options.zlibDeflateOptions,
            windowBits
          });
          this._deflate[kTotalLength] = 0;
          this._deflate[kBuffers] = [];
          this._deflate.on("data", deflateOnData);
        }
        this._deflate[kCallback] = callback;
        this._deflate.write(data);
        this._deflate.flush(zlib.Z_SYNC_FLUSH, () => {
          if (!this._deflate) {
            return;
          }
          let data2 = bufferUtil.concat(
            this._deflate[kBuffers],
            this._deflate[kTotalLength]
          );
          if (fin) {
            data2 = new FastBuffer(data2.buffer, data2.byteOffset, data2.length - 4);
          }
          this._deflate[kCallback] = null;
          this._deflate[kTotalLength] = 0;
          this._deflate[kBuffers] = [];
          if (fin && this.params[`${endpoint}_no_context_takeover`]) {
            this._deflate.reset();
          }
          callback(null, data2);
        });
      }
    };
    module2.exports = PerMessageDeflate2;
    function deflateOnData(chunk) {
      this[kBuffers].push(chunk);
      this[kTotalLength] += chunk.length;
    }
    function inflateOnData(chunk) {
      this[kTotalLength] += chunk.length;
      if (this[kPerMessageDeflate]._maxPayload < 1 || this[kTotalLength] <= this[kPerMessageDeflate]._maxPayload) {
        this[kBuffers].push(chunk);
        return;
      }
      this[kError] = new RangeError("Max payload size exceeded");
      this[kError].code = "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH";
      this[kError][kStatusCode] = 1009;
      this.removeListener("data", inflateOnData);
      this.reset();
    }
    function inflateOnError(err) {
      this[kPerMessageDeflate]._inflate = null;
      if (this[kError]) {
        this[kCallback](this[kError]);
        return;
      }
      err[kStatusCode] = 1007;
      this[kCallback](err);
    }
  }
});

// ../../node_modules/.pnpm/ws@8.21.2/node_modules/ws/lib/validation.js
var require_validation = __commonJS({
  "../../node_modules/.pnpm/ws@8.21.2/node_modules/ws/lib/validation.js"(exports2, module2) {
    "use strict";
    var { isUtf8 } = require("buffer");
    var { hasBlob } = require_constants();
    var tokenChars = [
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      // 0 - 15
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      0,
      // 16 - 31
      0,
      1,
      0,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      1,
      1,
      0,
      1,
      1,
      0,
      // 32 - 47
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      0,
      0,
      0,
      // 48 - 63
      0,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      // 64 - 79
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      0,
      0,
      1,
      1,
      // 80 - 95
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      // 96 - 111
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      1,
      0,
      1,
      0,
      1,
      0
      // 112 - 127
    ];
    function isValidStatusCode(code) {
      return code >= 1e3 && code <= 1014 && code !== 1004 && code !== 1005 && code !== 1006 || code >= 3e3 && code <= 4999;
    }
    function _isValidUTF8(buf) {
      const len = buf.length;
      let i = 0;
      while (i < len) {
        if ((buf[i] & 128) === 0) {
          i++;
        } else if ((buf[i] & 224) === 192) {
          if (i + 1 === len || (buf[i + 1] & 192) !== 128 || (buf[i] & 254) === 192) {
            return false;
          }
          i += 2;
        } else if ((buf[i] & 240) === 224) {
          if (i + 2 >= len || (buf[i + 1] & 192) !== 128 || (buf[i + 2] & 192) !== 128 || buf[i] === 224 && (buf[i + 1] & 224) === 128 || // Overlong
          buf[i] === 237 && (buf[i + 1] & 224) === 160) {
            return false;
          }
          i += 3;
        } else if ((buf[i] & 248) === 240) {
          if (i + 3 >= len || (buf[i + 1] & 192) !== 128 || (buf[i + 2] & 192) !== 128 || (buf[i + 3] & 192) !== 128 || buf[i] === 240 && (buf[i + 1] & 240) === 128 || // Overlong
          buf[i] === 244 && buf[i + 1] > 143 || buf[i] > 244) {
            return false;
          }
          i += 4;
        } else {
          return false;
        }
      }
      return true;
    }
    function isBlob(value) {
      return hasBlob && typeof value === "object" && typeof value.arrayBuffer === "function" && typeof value.type === "string" && typeof value.stream === "function" && (value[Symbol.toStringTag] === "Blob" || value[Symbol.toStringTag] === "File");
    }
    module2.exports = {
      isBlob,
      isValidStatusCode,
      isValidUTF8: _isValidUTF8,
      tokenChars
    };
    if (isUtf8) {
      module2.exports.isValidUTF8 = function(buf) {
        return buf.length < 24 ? _isValidUTF8(buf) : isUtf8(buf);
      };
    } else if (!process.env.WS_NO_UTF_8_VALIDATE) {
      try {
        const isValidUTF8 = require("utf-8-validate");
        module2.exports.isValidUTF8 = function(buf) {
          return buf.length < 32 ? _isValidUTF8(buf) : isValidUTF8(buf);
        };
      } catch (e) {
      }
    }
  }
});

// ../../node_modules/.pnpm/ws@8.21.2/node_modules/ws/lib/receiver.js
var require_receiver = __commonJS({
  "../../node_modules/.pnpm/ws@8.21.2/node_modules/ws/lib/receiver.js"(exports2, module2) {
    "use strict";
    var { Writable } = require("stream");
    var PerMessageDeflate2 = require_permessage_deflate();
    var {
      BINARY_TYPES,
      EMPTY_BUFFER,
      kStatusCode,
      kWebSocket
    } = require_constants();
    var { concat, toArrayBuffer, unmask } = require_buffer_util();
    var { isValidStatusCode, isValidUTF8 } = require_validation();
    var FastBuffer = Buffer[Symbol.species];
    var GET_INFO = 0;
    var GET_PAYLOAD_LENGTH_16 = 1;
    var GET_PAYLOAD_LENGTH_64 = 2;
    var GET_MASK = 3;
    var GET_DATA = 4;
    var INFLATING = 5;
    var DEFER_EVENT = 6;
    var Receiver2 = class extends Writable {
      /**
       * Creates a Receiver instance.
       *
       * @param {Object} [options] Options object
       * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {String} [options.binaryType=nodebuffer] The type for binary data
       * @param {Object} [options.extensions] An object containing the negotiated
       *     extensions
       * @param {Boolean} [options.isServer=false] Specifies whether to operate in
       *     client or server mode
       * @param {Number} [options.maxBufferedChunks=0] The maximum number of
       *     buffered data chunks
       * @param {Number} [options.maxFragments=0] The maximum number of message
       *     fragments
       * @param {Number} [options.maxPayload=0] The maximum allowed message length
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       */
      constructor(options = {}) {
        super();
        this._allowSynchronousEvents = options.allowSynchronousEvents !== void 0 ? options.allowSynchronousEvents : true;
        this._binaryType = options.binaryType || BINARY_TYPES[0];
        this._extensions = options.extensions || {};
        this._isServer = !!options.isServer;
        this._maxBufferedChunks = options.maxBufferedChunks | 0;
        this._maxFragments = options.maxFragments | 0;
        this._maxPayload = options.maxPayload | 0;
        this._skipUTF8Validation = !!options.skipUTF8Validation;
        this[kWebSocket] = void 0;
        this._bufferedBytes = 0;
        this._buffers = [];
        this._compressed = false;
        this._payloadLength = 0;
        this._mask = void 0;
        this._fragmented = 0;
        this._masked = false;
        this._fin = false;
        this._opcode = 0;
        this._totalPayloadLength = 0;
        this._messageLength = 0;
        this._numFragments = 0;
        this._fragments = [];
        this._errored = false;
        this._loop = false;
        this._state = GET_INFO;
      }
      /**
       * Implements `Writable.prototype._write()`.
       *
       * @param {Buffer} chunk The chunk of data to write
       * @param {String} encoding The character encoding of `chunk`
       * @param {Function} cb Callback
       * @private
       */
      _write(chunk, encoding, cb) {
        if (this._opcode === 8 && this._state == GET_INFO) return cb();
        if (this._maxBufferedChunks > 0 && this._buffers.length >= this._maxBufferedChunks) {
          cb(
            this.createError(
              RangeError,
              "Too many buffered chunks",
              false,
              1008,
              "WS_ERR_TOO_MANY_BUFFERED_PARTS"
            )
          );
          return;
        }
        this._bufferedBytes += chunk.length;
        this._buffers.push(chunk);
        this.startLoop(cb);
      }
      /**
       * Consumes `n` bytes from the buffered data.
       *
       * @param {Number} n The number of bytes to consume
       * @return {Buffer} The consumed bytes
       * @private
       */
      consume(n) {
        this._bufferedBytes -= n;
        if (n === this._buffers[0].length) return this._buffers.shift();
        if (n < this._buffers[0].length) {
          const buf = this._buffers[0];
          this._buffers[0] = new FastBuffer(
            buf.buffer,
            buf.byteOffset + n,
            buf.length - n
          );
          return new FastBuffer(buf.buffer, buf.byteOffset, n);
        }
        const dst = Buffer.allocUnsafe(n);
        do {
          const buf = this._buffers[0];
          const offset = dst.length - n;
          if (n >= buf.length) {
            dst.set(this._buffers.shift(), offset);
          } else {
            dst.set(new Uint8Array(buf.buffer, buf.byteOffset, n), offset);
            this._buffers[0] = new FastBuffer(
              buf.buffer,
              buf.byteOffset + n,
              buf.length - n
            );
          }
          n -= buf.length;
        } while (n > 0);
        return dst;
      }
      /**
       * Starts the parsing loop.
       *
       * @param {Function} cb Callback
       * @private
       */
      startLoop(cb) {
        this._loop = true;
        do {
          switch (this._state) {
            case GET_INFO:
              this.getInfo(cb);
              break;
            case GET_PAYLOAD_LENGTH_16:
              this.getPayloadLength16(cb);
              break;
            case GET_PAYLOAD_LENGTH_64:
              this.getPayloadLength64(cb);
              break;
            case GET_MASK:
              this.getMask();
              break;
            case GET_DATA:
              this.getData(cb);
              break;
            case INFLATING:
            case DEFER_EVENT:
              this._loop = false;
              return;
          }
        } while (this._loop);
        if (!this._errored) cb();
      }
      /**
       * Reads the first two bytes of a frame.
       *
       * @param {Function} cb Callback
       * @private
       */
      getInfo(cb) {
        if (this._bufferedBytes < 2) {
          this._loop = false;
          return;
        }
        const buf = this.consume(2);
        if ((buf[0] & 48) !== 0) {
          const error = this.createError(
            RangeError,
            "RSV2 and RSV3 must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_RSV_2_3"
          );
          cb(error);
          return;
        }
        const compressed = (buf[0] & 64) === 64;
        if (compressed && !this._extensions[PerMessageDeflate2.extensionName]) {
          const error = this.createError(
            RangeError,
            "RSV1 must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_RSV_1"
          );
          cb(error);
          return;
        }
        this._fin = (buf[0] & 128) === 128;
        this._opcode = buf[0] & 15;
        this._payloadLength = buf[1] & 127;
        if (this._opcode === 0) {
          if (compressed) {
            const error = this.createError(
              RangeError,
              "RSV1 must be clear",
              true,
              1002,
              "WS_ERR_UNEXPECTED_RSV_1"
            );
            cb(error);
            return;
          }
          if (!this._fragmented) {
            const error = this.createError(
              RangeError,
              "invalid opcode 0",
              true,
              1002,
              "WS_ERR_INVALID_OPCODE"
            );
            cb(error);
            return;
          }
          this._opcode = this._fragmented;
        } else if (this._opcode === 1 || this._opcode === 2) {
          if (this._fragmented) {
            const error = this.createError(
              RangeError,
              `invalid opcode ${this._opcode}`,
              true,
              1002,
              "WS_ERR_INVALID_OPCODE"
            );
            cb(error);
            return;
          }
          this._compressed = compressed;
        } else if (this._opcode > 7 && this._opcode < 11) {
          if (!this._fin) {
            const error = this.createError(
              RangeError,
              "FIN must be set",
              true,
              1002,
              "WS_ERR_EXPECTED_FIN"
            );
            cb(error);
            return;
          }
          if (compressed) {
            const error = this.createError(
              RangeError,
              "RSV1 must be clear",
              true,
              1002,
              "WS_ERR_UNEXPECTED_RSV_1"
            );
            cb(error);
            return;
          }
          if (this._payloadLength > 125 || this._opcode === 8 && this._payloadLength === 1) {
            const error = this.createError(
              RangeError,
              `invalid payload length ${this._payloadLength}`,
              true,
              1002,
              "WS_ERR_INVALID_CONTROL_PAYLOAD_LENGTH"
            );
            cb(error);
            return;
          }
        } else {
          const error = this.createError(
            RangeError,
            `invalid opcode ${this._opcode}`,
            true,
            1002,
            "WS_ERR_INVALID_OPCODE"
          );
          cb(error);
          return;
        }
        if (!this._fin && !this._fragmented) this._fragmented = this._opcode;
        this._masked = (buf[1] & 128) === 128;
        if (this._isServer) {
          if (!this._masked) {
            const error = this.createError(
              RangeError,
              "MASK must be set",
              true,
              1002,
              "WS_ERR_EXPECTED_MASK"
            );
            cb(error);
            return;
          }
        } else if (this._masked) {
          const error = this.createError(
            RangeError,
            "MASK must be clear",
            true,
            1002,
            "WS_ERR_UNEXPECTED_MASK"
          );
          cb(error);
          return;
        }
        if (this._payloadLength === 126) this._state = GET_PAYLOAD_LENGTH_16;
        else if (this._payloadLength === 127) this._state = GET_PAYLOAD_LENGTH_64;
        else this.haveLength(cb);
      }
      /**
       * Gets extended payload length (7+16).
       *
       * @param {Function} cb Callback
       * @private
       */
      getPayloadLength16(cb) {
        if (this._bufferedBytes < 2) {
          this._loop = false;
          return;
        }
        this._payloadLength = this.consume(2).readUInt16BE(0);
        this.haveLength(cb);
      }
      /**
       * Gets extended payload length (7+64).
       *
       * @param {Function} cb Callback
       * @private
       */
      getPayloadLength64(cb) {
        if (this._bufferedBytes < 8) {
          this._loop = false;
          return;
        }
        const buf = this.consume(8);
        const num = buf.readUInt32BE(0);
        if (num > Math.pow(2, 53 - 32) - 1) {
          const error = this.createError(
            RangeError,
            "Unsupported WebSocket frame: payload length > 2^53 - 1",
            false,
            1009,
            "WS_ERR_UNSUPPORTED_DATA_PAYLOAD_LENGTH"
          );
          cb(error);
          return;
        }
        this._payloadLength = num * Math.pow(2, 32) + buf.readUInt32BE(4);
        this.haveLength(cb);
      }
      /**
       * Payload length has been read.
       *
       * @param {Function} cb Callback
       * @private
       */
      haveLength(cb) {
        if (this._payloadLength && this._opcode < 8) {
          this._totalPayloadLength += this._payloadLength;
          if (this._totalPayloadLength > this._maxPayload && this._maxPayload > 0) {
            const error = this.createError(
              RangeError,
              "Max payload size exceeded",
              false,
              1009,
              "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"
            );
            cb(error);
            return;
          }
        }
        if (this._masked) this._state = GET_MASK;
        else this._state = GET_DATA;
      }
      /**
       * Reads mask bytes.
       *
       * @private
       */
      getMask() {
        if (this._bufferedBytes < 4) {
          this._loop = false;
          return;
        }
        this._mask = this.consume(4);
        this._state = GET_DATA;
      }
      /**
       * Reads data bytes.
       *
       * @param {Function} cb Callback
       * @private
       */
      getData(cb) {
        let data = EMPTY_BUFFER;
        if (this._payloadLength) {
          if (this._bufferedBytes < this._payloadLength) {
            this._loop = false;
            return;
          }
          data = this.consume(this._payloadLength);
          if (this._masked && (this._mask[0] | this._mask[1] | this._mask[2] | this._mask[3]) !== 0) {
            unmask(data, this._mask);
          }
        }
        if (this._opcode > 7) {
          this.controlMessage(data, cb);
          return;
        }
        if (this._maxFragments > 0 && ++this._numFragments > this._maxFragments) {
          const error = this.createError(
            RangeError,
            "Too many message fragments",
            false,
            1008,
            "WS_ERR_TOO_MANY_BUFFERED_PARTS"
          );
          cb(error);
          return;
        }
        if (this._compressed) {
          this._state = INFLATING;
          this.decompress(data, cb);
          return;
        }
        if (data.length) {
          this._messageLength = this._totalPayloadLength;
          this._fragments.push(data);
        }
        this.dataMessage(cb);
      }
      /**
       * Decompresses data.
       *
       * @param {Buffer} data Compressed data
       * @param {Function} cb Callback
       * @private
       */
      decompress(data, cb) {
        const perMessageDeflate = this._extensions[PerMessageDeflate2.extensionName];
        perMessageDeflate.decompress(data, this._fin, (err, buf) => {
          if (err) return cb(err);
          if (buf.length) {
            this._messageLength += buf.length;
            if (this._messageLength > this._maxPayload && this._maxPayload > 0) {
              const error = this.createError(
                RangeError,
                "Max payload size exceeded",
                false,
                1009,
                "WS_ERR_UNSUPPORTED_MESSAGE_LENGTH"
              );
              cb(error);
              return;
            }
            this._fragments.push(buf);
          }
          this.dataMessage(cb);
          if (this._state === GET_INFO) this.startLoop(cb);
        });
      }
      /**
       * Handles a data message.
       *
       * @param {Function} cb Callback
       * @private
       */
      dataMessage(cb) {
        if (!this._fin) {
          this._state = GET_INFO;
          return;
        }
        const messageLength = this._messageLength;
        const fragments = this._fragments;
        this._totalPayloadLength = 0;
        this._messageLength = 0;
        this._fragmented = 0;
        this._numFragments = 0;
        this._fragments = [];
        if (this._opcode === 2) {
          let data;
          if (this._binaryType === "nodebuffer") {
            data = concat(fragments, messageLength);
          } else if (this._binaryType === "arraybuffer") {
            data = toArrayBuffer(concat(fragments, messageLength));
          } else if (this._binaryType === "blob") {
            data = new Blob(fragments);
          } else {
            data = fragments;
          }
          if (this._allowSynchronousEvents) {
            this.emit("message", data, true);
            this._state = GET_INFO;
          } else {
            this._state = DEFER_EVENT;
            setImmediate(() => {
              this.emit("message", data, true);
              this._state = GET_INFO;
              this.startLoop(cb);
            });
          }
        } else {
          const buf = concat(fragments, messageLength);
          if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
            const error = this.createError(
              Error,
              "invalid UTF-8 sequence",
              true,
              1007,
              "WS_ERR_INVALID_UTF8"
            );
            cb(error);
            return;
          }
          if (this._state === INFLATING || this._allowSynchronousEvents) {
            this.emit("message", buf, false);
            this._state = GET_INFO;
          } else {
            this._state = DEFER_EVENT;
            setImmediate(() => {
              this.emit("message", buf, false);
              this._state = GET_INFO;
              this.startLoop(cb);
            });
          }
        }
      }
      /**
       * Handles a control message.
       *
       * @param {Buffer} data Data to handle
       * @return {(Error|RangeError|undefined)} A possible error
       * @private
       */
      controlMessage(data, cb) {
        if (this._opcode === 8) {
          if (data.length === 0) {
            this._loop = false;
            this.emit("conclude", 1005, EMPTY_BUFFER);
            this.end();
          } else {
            const code = data.readUInt16BE(0);
            if (!isValidStatusCode(code)) {
              const error = this.createError(
                RangeError,
                `invalid status code ${code}`,
                true,
                1002,
                "WS_ERR_INVALID_CLOSE_CODE"
              );
              cb(error);
              return;
            }
            const buf = new FastBuffer(
              data.buffer,
              data.byteOffset + 2,
              data.length - 2
            );
            if (!this._skipUTF8Validation && !isValidUTF8(buf)) {
              const error = this.createError(
                Error,
                "invalid UTF-8 sequence",
                true,
                1007,
                "WS_ERR_INVALID_UTF8"
              );
              cb(error);
              return;
            }
            this._loop = false;
            this.emit("conclude", code, buf);
            this.end();
          }
          this._state = GET_INFO;
          return;
        }
        if (this._allowSynchronousEvents) {
          this.emit(this._opcode === 9 ? "ping" : "pong", data);
          this._state = GET_INFO;
        } else {
          this._state = DEFER_EVENT;
          setImmediate(() => {
            this.emit(this._opcode === 9 ? "ping" : "pong", data);
            this._state = GET_INFO;
            this.startLoop(cb);
          });
        }
      }
      /**
       * Builds an error object.
       *
       * @param {function(new:Error|RangeError)} ErrorCtor The error constructor
       * @param {String} message The error message
       * @param {Boolean} prefix Specifies whether or not to add a default prefix to
       *     `message`
       * @param {Number} statusCode The status code
       * @param {String} errorCode The exposed error code
       * @return {(Error|RangeError)} The error
       * @private
       */
      createError(ErrorCtor, message, prefix, statusCode, errorCode) {
        this._loop = false;
        this._errored = true;
        const err = new ErrorCtor(
          prefix ? `Invalid WebSocket frame: ${message}` : message
        );
        Error.captureStackTrace(err, this.createError);
        err.code = errorCode;
        err[kStatusCode] = statusCode;
        return err;
      }
    };
    module2.exports = Receiver2;
  }
});

// ../../node_modules/.pnpm/ws@8.21.2/node_modules/ws/lib/sender.js
var require_sender = __commonJS({
  "../../node_modules/.pnpm/ws@8.21.2/node_modules/ws/lib/sender.js"(exports2, module2) {
    "use strict";
    var { Duplex } = require("stream");
    var { randomFillSync } = require("crypto");
    var {
      types: { isUint8Array }
    } = require("util");
    var PerMessageDeflate2 = require_permessage_deflate();
    var { EMPTY_BUFFER, kWebSocket, NOOP } = require_constants();
    var { isBlob, isValidStatusCode } = require_validation();
    var { mask: applyMask, toBuffer } = require_buffer_util();
    var kByteLength = /* @__PURE__ */ Symbol("kByteLength");
    var maskBuffer = Buffer.alloc(4);
    var RANDOM_POOL_SIZE = 8 * 1024;
    var randomPool;
    var randomPoolPointer = RANDOM_POOL_SIZE;
    var DEFAULT = 0;
    var DEFLATING = 1;
    var GET_BLOB_DATA = 2;
    var Sender2 = class _Sender {
      /**
       * Creates a Sender instance.
       *
       * @param {Duplex} socket The connection socket
       * @param {Object} [extensions] An object containing the negotiated extensions
       * @param {Function} [generateMask] The function used to generate the masking
       *     key
       */
      constructor(socket, extensions, generateMask) {
        this._extensions = extensions || {};
        if (generateMask) {
          this._generateMask = generateMask;
          this._maskBuffer = Buffer.alloc(4);
        }
        this._socket = socket;
        this._firstFragment = true;
        this._compress = false;
        this._bufferedBytes = 0;
        this._queue = [];
        this._state = DEFAULT;
        this.onerror = NOOP;
        this[kWebSocket] = void 0;
      }
      /**
       * Frames a piece of data according to the HyBi WebSocket protocol.
       *
       * @param {(Buffer|String)} data The data to frame
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @return {(Buffer|String)[]} The framed data
       * @public
       */
      static frame(data, options) {
        let mask;
        let merge = false;
        let offset = 2;
        let skipMasking = false;
        if (options.mask) {
          mask = options.maskBuffer || maskBuffer;
          if (options.generateMask) {
            options.generateMask(mask);
          } else {
            if (randomPoolPointer === RANDOM_POOL_SIZE) {
              if (randomPool === void 0) {
                randomPool = Buffer.alloc(RANDOM_POOL_SIZE);
              }
              randomFillSync(randomPool, 0, RANDOM_POOL_SIZE);
              randomPoolPointer = 0;
            }
            mask[0] = randomPool[randomPoolPointer++];
            mask[1] = randomPool[randomPoolPointer++];
            mask[2] = randomPool[randomPoolPointer++];
            mask[3] = randomPool[randomPoolPointer++];
          }
          skipMasking = (mask[0] | mask[1] | mask[2] | mask[3]) === 0;
          offset = 6;
        }
        let dataLength;
        if (typeof data === "string") {
          if ((!options.mask || skipMasking) && options[kByteLength] !== void 0) {
            dataLength = options[kByteLength];
          } else {
            data = Buffer.from(data);
            dataLength = data.length;
          }
        } else {
          dataLength = data.length;
          merge = options.mask && options.readOnly && !skipMasking;
        }
        let payloadLength = dataLength;
        if (dataLength >= 65536) {
          offset += 8;
          payloadLength = 127;
        } else if (dataLength > 125) {
          offset += 2;
          payloadLength = 126;
        }
        const target = Buffer.allocUnsafe(merge ? dataLength + offset : offset);
        target[0] = options.fin ? options.opcode | 128 : options.opcode;
        if (options.rsv1) target[0] |= 64;
        target[1] = payloadLength;
        if (payloadLength === 126) {
          target.writeUInt16BE(dataLength, 2);
        } else if (payloadLength === 127) {
          target[2] = target[3] = 0;
          target.writeUIntBE(dataLength, 4, 6);
        }
        if (!options.mask) return [target, data];
        target[1] |= 128;
        target[offset - 4] = mask[0];
        target[offset - 3] = mask[1];
        target[offset - 2] = mask[2];
        target[offset - 1] = mask[3];
        if (skipMasking) return [target, data];
        if (merge) {
          applyMask(data, mask, target, offset, dataLength);
          return [target];
        }
        applyMask(data, mask, data, 0, dataLength);
        return [target, data];
      }
      /**
       * Sends a close message to the other peer.
       *
       * @param {Number} [code] The status code component of the body
       * @param {(String|Buffer)} [data] The message component of the body
       * @param {Boolean} [mask=false] Specifies whether or not to mask the message
       * @param {Function} [cb] Callback
       * @public
       */
      close(code, data, mask, cb) {
        let buf;
        if (code === void 0) {
          buf = EMPTY_BUFFER;
        } else if (typeof code !== "number" || !isValidStatusCode(code)) {
          throw new TypeError("First argument must be a valid error code number");
        } else if (data === void 0 || !data.length) {
          buf = Buffer.allocUnsafe(2);
          buf.writeUInt16BE(code, 0);
        } else {
          const length = Buffer.byteLength(data);
          if (length > 123) {
            throw new RangeError("The message must not be greater than 123 bytes");
          }
          buf = Buffer.allocUnsafe(2 + length);
          buf.writeUInt16BE(code, 0);
          if (typeof data === "string") {
            buf.write(data, 2);
          } else if (isUint8Array(data)) {
            buf.set(data, 2);
          } else {
            throw new TypeError("Second argument must be a string or a Uint8Array");
          }
        }
        const options = {
          [kByteLength]: buf.length,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 8,
          readOnly: false,
          rsv1: false
        };
        if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, buf, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(buf, options), cb);
        }
      }
      /**
       * Sends a ping message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback
       * @public
       */
      ping(data, mask, cb) {
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (byteLength > 125) {
          throw new RangeError("The data size must not be greater than 125 bytes");
        }
        const options = {
          [kByteLength]: byteLength,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 9,
          readOnly,
          rsv1: false
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, false, options, cb]);
          } else {
            this.getBlobData(data, false, options, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(data, options), cb);
        }
      }
      /**
       * Sends a pong message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Boolean} [mask=false] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback
       * @public
       */
      pong(data, mask, cb) {
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (byteLength > 125) {
          throw new RangeError("The data size must not be greater than 125 bytes");
        }
        const options = {
          [kByteLength]: byteLength,
          fin: true,
          generateMask: this._generateMask,
          mask,
          maskBuffer: this._maskBuffer,
          opcode: 10,
          readOnly,
          rsv1: false
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, false, options, cb]);
          } else {
            this.getBlobData(data, false, options, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, false, options, cb]);
        } else {
          this.sendFrame(_Sender.frame(data, options), cb);
        }
      }
      /**
       * Sends a data message to the other peer.
       *
       * @param {*} data The message to send
       * @param {Object} options Options object
       * @param {Boolean} [options.binary=false] Specifies whether `data` is binary
       *     or text
       * @param {Boolean} [options.compress=false] Specifies whether or not to
       *     compress `data`
       * @param {Boolean} [options.fin=false] Specifies whether the fragment is the
       *     last one
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Function} [cb] Callback
       * @public
       */
      send(data, options, cb) {
        const perMessageDeflate = this._extensions[PerMessageDeflate2.extensionName];
        let opcode = options.binary ? 2 : 1;
        let rsv1 = options.compress;
        let byteLength;
        let readOnly;
        if (typeof data === "string") {
          byteLength = Buffer.byteLength(data);
          readOnly = false;
        } else if (isBlob(data)) {
          byteLength = data.size;
          readOnly = false;
        } else {
          data = toBuffer(data);
          byteLength = data.length;
          readOnly = toBuffer.readOnly;
        }
        if (this._firstFragment) {
          this._firstFragment = false;
          if (rsv1 && perMessageDeflate && perMessageDeflate.params[perMessageDeflate._isServer ? "server_no_context_takeover" : "client_no_context_takeover"]) {
            rsv1 = byteLength >= perMessageDeflate._threshold;
          }
          this._compress = rsv1;
        } else {
          rsv1 = false;
          opcode = 0;
        }
        if (options.fin) this._firstFragment = true;
        const opts = {
          [kByteLength]: byteLength,
          fin: options.fin,
          generateMask: this._generateMask,
          mask: options.mask,
          maskBuffer: this._maskBuffer,
          opcode,
          readOnly,
          rsv1
        };
        if (isBlob(data)) {
          if (this._state !== DEFAULT) {
            this.enqueue([this.getBlobData, data, this._compress, opts, cb]);
          } else {
            this.getBlobData(data, this._compress, opts, cb);
          }
        } else if (this._state !== DEFAULT) {
          this.enqueue([this.dispatch, data, this._compress, opts, cb]);
        } else {
          this.dispatch(data, this._compress, opts, cb);
        }
      }
      /**
       * Gets the contents of a blob as binary data.
       *
       * @param {Blob} blob The blob
       * @param {Boolean} [compress=false] Specifies whether or not to compress
       *     the data
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @param {Function} [cb] Callback
       * @private
       */
      getBlobData(blob, compress, options, cb) {
        this._bufferedBytes += options[kByteLength];
        this._state = GET_BLOB_DATA;
        blob.arrayBuffer().then((arrayBuffer) => {
          if (this._socket.destroyed) {
            const err = new Error(
              "The socket was closed while the blob was being read"
            );
            process.nextTick(callCallbacks, this, err, cb);
            return;
          }
          this._bufferedBytes -= options[kByteLength];
          const data = toBuffer(arrayBuffer);
          if (!compress) {
            this._state = DEFAULT;
            this.sendFrame(_Sender.frame(data, options), cb);
            this.dequeue();
          } else {
            this.dispatch(data, compress, options, cb);
          }
        }).catch((err) => {
          process.nextTick(onError, this, err, cb);
        });
      }
      /**
       * Dispatches a message.
       *
       * @param {(Buffer|String)} data The message to send
       * @param {Boolean} [compress=false] Specifies whether or not to compress
       *     `data`
       * @param {Object} options Options object
       * @param {Boolean} [options.fin=false] Specifies whether or not to set the
       *     FIN bit
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Boolean} [options.mask=false] Specifies whether or not to mask
       *     `data`
       * @param {Buffer} [options.maskBuffer] The buffer used to store the masking
       *     key
       * @param {Number} options.opcode The opcode
       * @param {Boolean} [options.readOnly=false] Specifies whether `data` can be
       *     modified
       * @param {Boolean} [options.rsv1=false] Specifies whether or not to set the
       *     RSV1 bit
       * @param {Function} [cb] Callback
       * @private
       */
      dispatch(data, compress, options, cb) {
        if (!compress) {
          this.sendFrame(_Sender.frame(data, options), cb);
          return;
        }
        const perMessageDeflate = this._extensions[PerMessageDeflate2.extensionName];
        this._bufferedBytes += options[kByteLength];
        this._state = DEFLATING;
        perMessageDeflate.compress(data, options.fin, (_, buf) => {
          if (this._socket.destroyed) {
            const err = new Error(
              "The socket was closed while data was being compressed"
            );
            callCallbacks(this, err, cb);
            return;
          }
          this._bufferedBytes -= options[kByteLength];
          this._state = DEFAULT;
          options.readOnly = false;
          this.sendFrame(_Sender.frame(buf, options), cb);
          this.dequeue();
        });
      }
      /**
       * Executes queued send operations.
       *
       * @private
       */
      dequeue() {
        while (this._state === DEFAULT && this._queue.length) {
          const params = this._queue.shift();
          this._bufferedBytes -= params[3][kByteLength];
          Reflect.apply(params[0], this, params.slice(1));
        }
      }
      /**
       * Enqueues a send operation.
       *
       * @param {Array} params Send operation parameters.
       * @private
       */
      enqueue(params) {
        this._bufferedBytes += params[3][kByteLength];
        this._queue.push(params);
      }
      /**
       * Sends a frame.
       *
       * @param {(Buffer | String)[]} list The frame to send
       * @param {Function} [cb] Callback
       * @private
       */
      sendFrame(list, cb) {
        if (list.length === 2) {
          this._socket.cork();
          this._socket.write(list[0]);
          this._socket.write(list[1], cb);
          this._socket.uncork();
        } else {
          this._socket.write(list[0], cb);
        }
      }
    };
    module2.exports = Sender2;
    function callCallbacks(sender, err, cb) {
      if (typeof cb === "function") cb(err);
      for (let i = 0; i < sender._queue.length; i++) {
        const params = sender._queue[i];
        const callback = params[params.length - 1];
        if (typeof callback === "function") callback(err);
      }
    }
    function onError(sender, err, cb) {
      callCallbacks(sender, err, cb);
      sender.onerror(err);
    }
  }
});

// ../../node_modules/.pnpm/ws@8.21.2/node_modules/ws/lib/event-target.js
var require_event_target = __commonJS({
  "../../node_modules/.pnpm/ws@8.21.2/node_modules/ws/lib/event-target.js"(exports2, module2) {
    "use strict";
    var { kForOnEventAttribute, kListener } = require_constants();
    var kCode = /* @__PURE__ */ Symbol("kCode");
    var kData = /* @__PURE__ */ Symbol("kData");
    var kError = /* @__PURE__ */ Symbol("kError");
    var kMessage = /* @__PURE__ */ Symbol("kMessage");
    var kReason = /* @__PURE__ */ Symbol("kReason");
    var kTarget = /* @__PURE__ */ Symbol("kTarget");
    var kType = /* @__PURE__ */ Symbol("kType");
    var kWasClean = /* @__PURE__ */ Symbol("kWasClean");
    var Event = class {
      /**
       * Create a new `Event`.
       *
       * @param {String} type The name of the event
       * @throws {TypeError} If the `type` argument is not specified
       */
      constructor(type) {
        this[kTarget] = null;
        this[kType] = type;
      }
      /**
       * @type {*}
       */
      get target() {
        return this[kTarget];
      }
      /**
       * @type {String}
       */
      get type() {
        return this[kType];
      }
    };
    Object.defineProperty(Event.prototype, "target", { enumerable: true });
    Object.defineProperty(Event.prototype, "type", { enumerable: true });
    var CloseEvent = class extends Event {
      /**
       * Create a new `CloseEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {Number} [options.code=0] The status code explaining why the
       *     connection was closed
       * @param {String} [options.reason=''] A human-readable string explaining why
       *     the connection was closed
       * @param {Boolean} [options.wasClean=false] Indicates whether or not the
       *     connection was cleanly closed
       */
      constructor(type, options = {}) {
        super(type);
        this[kCode] = options.code === void 0 ? 0 : options.code;
        this[kReason] = options.reason === void 0 ? "" : options.reason;
        this[kWasClean] = options.wasClean === void 0 ? false : options.wasClean;
      }
      /**
       * @type {Number}
       */
      get code() {
        return this[kCode];
      }
      /**
       * @type {String}
       */
      get reason() {
        return this[kReason];
      }
      /**
       * @type {Boolean}
       */
      get wasClean() {
        return this[kWasClean];
      }
    };
    Object.defineProperty(CloseEvent.prototype, "code", { enumerable: true });
    Object.defineProperty(CloseEvent.prototype, "reason", { enumerable: true });
    Object.defineProperty(CloseEvent.prototype, "wasClean", { enumerable: true });
    var ErrorEvent = class extends Event {
      /**
       * Create a new `ErrorEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {*} [options.error=null] The error that generated this event
       * @param {String} [options.message=''] The error message
       */
      constructor(type, options = {}) {
        super(type);
        this[kError] = options.error === void 0 ? null : options.error;
        this[kMessage] = options.message === void 0 ? "" : options.message;
      }
      /**
       * @type {*}
       */
      get error() {
        return this[kError];
      }
      /**
       * @type {String}
       */
      get message() {
        return this[kMessage];
      }
    };
    Object.defineProperty(ErrorEvent.prototype, "error", { enumerable: true });
    Object.defineProperty(ErrorEvent.prototype, "message", { enumerable: true });
    var MessageEvent = class extends Event {
      /**
       * Create a new `MessageEvent`.
       *
       * @param {String} type The name of the event
       * @param {Object} [options] A dictionary object that allows for setting
       *     attributes via object members of the same name
       * @param {*} [options.data=null] The message content
       */
      constructor(type, options = {}) {
        super(type);
        this[kData] = options.data === void 0 ? null : options.data;
      }
      /**
       * @type {*}
       */
      get data() {
        return this[kData];
      }
    };
    Object.defineProperty(MessageEvent.prototype, "data", { enumerable: true });
    var EventTarget = {
      /**
       * Register an event listener.
       *
       * @param {String} type A string representing the event type to listen for
       * @param {(Function|Object)} handler The listener to add
       * @param {Object} [options] An options object specifies characteristics about
       *     the event listener
       * @param {Boolean} [options.once=false] A `Boolean` indicating that the
       *     listener should be invoked at most once after being added. If `true`,
       *     the listener would be automatically removed when invoked.
       * @public
       */
      addEventListener(type, handler, options = {}) {
        for (const listener of this.listeners(type)) {
          if (!options[kForOnEventAttribute] && listener[kListener] === handler && !listener[kForOnEventAttribute]) {
            return;
          }
        }
        let wrapper;
        if (type === "message") {
          wrapper = function onMessage(data, isBinary) {
            const event = new MessageEvent("message", {
              data: isBinary ? data : data.toString()
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "close") {
          wrapper = function onClose(code, message) {
            const event = new CloseEvent("close", {
              code,
              reason: message.toString(),
              wasClean: this._closeFrameReceived && this._closeFrameSent
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "error") {
          wrapper = function onError(error) {
            const event = new ErrorEvent("error", {
              error,
              message: error.message
            });
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else if (type === "open") {
          wrapper = function onOpen() {
            const event = new Event("open");
            event[kTarget] = this;
            callListener(handler, this, event);
          };
        } else {
          return;
        }
        wrapper[kForOnEventAttribute] = !!options[kForOnEventAttribute];
        wrapper[kListener] = handler;
        if (options.once) {
          this.once(type, wrapper);
        } else {
          this.on(type, wrapper);
        }
      },
      /**
       * Remove an event listener.
       *
       * @param {String} type A string representing the event type to remove
       * @param {(Function|Object)} handler The listener to remove
       * @public
       */
      removeEventListener(type, handler) {
        for (const listener of this.listeners(type)) {
          if (listener[kListener] === handler && !listener[kForOnEventAttribute]) {
            this.removeListener(type, listener);
            break;
          }
        }
      }
    };
    module2.exports = {
      CloseEvent,
      ErrorEvent,
      Event,
      EventTarget,
      MessageEvent
    };
    function callListener(listener, thisArg, event) {
      if (typeof listener === "object" && listener.handleEvent) {
        listener.handleEvent.call(listener, event);
      } else {
        listener.call(thisArg, event);
      }
    }
  }
});

// ../../node_modules/.pnpm/ws@8.21.2/node_modules/ws/lib/extension.js
var require_extension = __commonJS({
  "../../node_modules/.pnpm/ws@8.21.2/node_modules/ws/lib/extension.js"(exports2, module2) {
    "use strict";
    var { tokenChars } = require_validation();
    function push(dest, name, elem) {
      if (dest[name] === void 0) dest[name] = [elem];
      else dest[name].push(elem);
    }
    function parse(header) {
      const offers = /* @__PURE__ */ Object.create(null);
      let params = /* @__PURE__ */ Object.create(null);
      let mustUnescape = false;
      let isEscaping = false;
      let inQuotes = false;
      let extensionName;
      let paramName;
      let start = -1;
      let code = -1;
      let end = -1;
      let i = 0;
      for (; i < header.length; i++) {
        code = header.charCodeAt(i);
        if (extensionName === void 0) {
          if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (i !== 0 && (code === 32 || code === 9)) {
            if (end === -1 && start !== -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            const name = header.slice(start, end);
            if (code === 44) {
              push(offers, name, params);
              params = /* @__PURE__ */ Object.create(null);
            } else {
              extensionName = name;
            }
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        } else if (paramName === void 0) {
          if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (code === 32 || code === 9) {
            if (end === -1 && start !== -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            push(params, header.slice(start, end), true);
            if (code === 44) {
              push(offers, extensionName, params);
              params = /* @__PURE__ */ Object.create(null);
              extensionName = void 0;
            }
            start = end = -1;
          } else if (code === 61 && start !== -1 && end === -1) {
            paramName = header.slice(start, i);
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        } else {
          if (isEscaping) {
            if (tokenChars[code] !== 1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (start === -1) start = i;
            else if (!mustUnescape) mustUnescape = true;
            isEscaping = false;
          } else if (inQuotes) {
            if (tokenChars[code] === 1) {
              if (start === -1) start = i;
            } else if (code === 34 && start !== -1) {
              inQuotes = false;
              end = i;
            } else if (code === 92) {
              isEscaping = true;
            } else {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
          } else if (code === 34 && header.charCodeAt(i - 1) === 61) {
            inQuotes = true;
          } else if (end === -1 && tokenChars[code] === 1) {
            if (start === -1) start = i;
          } else if (start !== -1 && (code === 32 || code === 9)) {
            if (end === -1) end = i;
          } else if (code === 59 || code === 44) {
            if (start === -1) {
              throw new SyntaxError(`Unexpected character at index ${i}`);
            }
            if (end === -1) end = i;
            let value = header.slice(start, end);
            if (mustUnescape) {
              value = value.replace(/\\/g, "");
              mustUnescape = false;
            }
            push(params, paramName, value);
            if (code === 44) {
              push(offers, extensionName, params);
              params = /* @__PURE__ */ Object.create(null);
              extensionName = void 0;
            }
            paramName = void 0;
            start = end = -1;
          } else {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
        }
      }
      if (start === -1 || inQuotes || code === 32 || code === 9) {
        throw new SyntaxError("Unexpected end of input");
      }
      if (end === -1) end = i;
      const token = header.slice(start, end);
      if (extensionName === void 0) {
        push(offers, token, params);
      } else {
        if (paramName === void 0) {
          push(params, token, true);
        } else if (mustUnescape) {
          push(params, paramName, token.replace(/\\/g, ""));
        } else {
          push(params, paramName, token);
        }
        push(offers, extensionName, params);
      }
      return offers;
    }
    function format(extensions) {
      return Object.keys(extensions).map((extension2) => {
        let configurations = extensions[extension2];
        if (!Array.isArray(configurations)) configurations = [configurations];
        return configurations.map((params) => {
          return [extension2].concat(
            Object.keys(params).map((k) => {
              let values = params[k];
              if (!Array.isArray(values)) values = [values];
              return values.map((v) => v === true ? k : `${k}=${v}`).join("; ");
            })
          ).join("; ");
        }).join(", ");
      }).join(", ");
    }
    module2.exports = { format, parse };
  }
});

// ../../node_modules/.pnpm/ws@8.21.2/node_modules/ws/lib/websocket.js
var require_websocket = __commonJS({
  "../../node_modules/.pnpm/ws@8.21.2/node_modules/ws/lib/websocket.js"(exports2, module2) {
    "use strict";
    var EventEmitter = require("events");
    var https = require("https");
    var http = require("http");
    var net2 = require("net");
    var tls = require("tls");
    var { randomBytes, createHash } = require("crypto");
    var { Duplex, Readable } = require("stream");
    var { URL: URL2 } = require("url");
    var PerMessageDeflate2 = require_permessage_deflate();
    var Receiver2 = require_receiver();
    var Sender2 = require_sender();
    var { isBlob } = require_validation();
    var {
      BINARY_TYPES,
      CLOSE_TIMEOUT,
      EMPTY_BUFFER,
      GUID,
      kForOnEventAttribute,
      kListener,
      kStatusCode,
      kWebSocket,
      NOOP
    } = require_constants();
    var {
      EventTarget: { addEventListener, removeEventListener }
    } = require_event_target();
    var { format, parse } = require_extension();
    var { toBuffer } = require_buffer_util();
    var kAborted = /* @__PURE__ */ Symbol("kAborted");
    var protocolVersions = [8, 13];
    var readyStates = ["CONNECTING", "OPEN", "CLOSING", "CLOSED"];
    var subprotocolRegex = /^[!#$%&'*+\-.0-9A-Z^_`|a-z~]+$/;
    var WebSocket2 = class _WebSocket extends EventEmitter {
      /**
       * Create a new `WebSocket`.
       *
       * @param {(String|URL)} address The URL to which to connect
       * @param {(String|String[])} [protocols] The subprotocols
       * @param {Object} [options] Connection options
       */
      constructor(address, protocols, options) {
        super();
        this._binaryType = BINARY_TYPES[0];
        this._closeCode = 1006;
        this._closeFrameReceived = false;
        this._closeFrameSent = false;
        this._closeMessage = EMPTY_BUFFER;
        this._closeTimer = null;
        this._errorEmitted = false;
        this._extensions = {};
        this._paused = false;
        this._protocol = "";
        this._readyState = _WebSocket.CONNECTING;
        this._receiver = null;
        this._sender = null;
        this._socket = null;
        if (address !== null) {
          this._bufferedAmount = 0;
          this._isServer = false;
          this._redirects = 0;
          if (protocols === void 0) {
            protocols = [];
          } else if (!Array.isArray(protocols)) {
            if (typeof protocols === "object" && protocols !== null) {
              options = protocols;
              protocols = [];
            } else {
              protocols = [protocols];
            }
          }
          initAsClient(this, address, protocols, options);
        } else {
          this._autoPong = options.autoPong;
          this._closeTimeout = options.closeTimeout;
          this._isServer = true;
        }
      }
      /**
       * For historical reasons, the custom "nodebuffer" type is used by the default
       * instead of "blob".
       *
       * @type {String}
       */
      get binaryType() {
        return this._binaryType;
      }
      set binaryType(type) {
        if (!BINARY_TYPES.includes(type)) return;
        this._binaryType = type;
        if (this._receiver) this._receiver._binaryType = type;
      }
      /**
       * @type {Number}
       */
      get bufferedAmount() {
        if (!this._socket) return this._bufferedAmount;
        return this._socket._writableState.length + this._sender._bufferedBytes;
      }
      /**
       * @type {String}
       */
      get extensions() {
        return Object.keys(this._extensions).join();
      }
      /**
       * @type {Boolean}
       */
      get isPaused() {
        return this._paused;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onclose() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onerror() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onopen() {
        return null;
      }
      /**
       * @type {Function}
       */
      /* istanbul ignore next */
      get onmessage() {
        return null;
      }
      /**
       * @type {String}
       */
      get protocol() {
        return this._protocol;
      }
      /**
       * @type {Number}
       */
      get readyState() {
        return this._readyState;
      }
      /**
       * @type {String}
       */
      get url() {
        return this._url;
      }
      /**
       * Set up the socket and the internal resources.
       *
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Object} options Options object
       * @param {Boolean} [options.allowSynchronousEvents=false] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {Function} [options.generateMask] The function used to generate the
       *     masking key
       * @param {Number} [options.maxBufferedChunks=0] The maximum number of
       *     buffered data chunks
       * @param {Number} [options.maxFragments=0] The maximum number of message
       *     fragments
       * @param {Number} [options.maxPayload=0] The maximum allowed message size
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       * @private
       */
      setSocket(socket, head, options) {
        const receiver = new Receiver2({
          allowSynchronousEvents: options.allowSynchronousEvents,
          binaryType: this.binaryType,
          extensions: this._extensions,
          isServer: this._isServer,
          maxBufferedChunks: options.maxBufferedChunks,
          maxFragments: options.maxFragments,
          maxPayload: options.maxPayload,
          skipUTF8Validation: options.skipUTF8Validation
        });
        const sender = new Sender2(socket, this._extensions, options.generateMask);
        this._receiver = receiver;
        this._sender = sender;
        this._socket = socket;
        receiver[kWebSocket] = this;
        sender[kWebSocket] = this;
        socket[kWebSocket] = this;
        receiver.on("conclude", receiverOnConclude);
        receiver.on("drain", receiverOnDrain);
        receiver.on("error", receiverOnError);
        receiver.on("message", receiverOnMessage);
        receiver.on("ping", receiverOnPing);
        receiver.on("pong", receiverOnPong);
        sender.onerror = senderOnError;
        if (socket.setTimeout) socket.setTimeout(0);
        if (socket.setNoDelay) socket.setNoDelay();
        if (head.length > 0) socket.unshift(head);
        socket.on("close", socketOnClose);
        socket.on("data", socketOnData);
        socket.on("end", socketOnEnd);
        socket.on("error", socketOnError);
        this._readyState = _WebSocket.OPEN;
        this.emit("open");
      }
      /**
       * Emit the `'close'` event.
       *
       * @private
       */
      emitClose() {
        if (!this._socket) {
          this._readyState = _WebSocket.CLOSED;
          this.emit("close", this._closeCode, this._closeMessage);
          return;
        }
        if (this._extensions[PerMessageDeflate2.extensionName]) {
          this._extensions[PerMessageDeflate2.extensionName].cleanup();
        }
        this._receiver.removeAllListeners();
        this._readyState = _WebSocket.CLOSED;
        this.emit("close", this._closeCode, this._closeMessage);
      }
      /**
       * Start a closing handshake.
       *
       *          +----------+   +-----------+   +----------+
       *     - - -|ws.close()|-->|close frame|-->|ws.close()|- - -
       *    |     +----------+   +-----------+   +----------+     |
       *          +----------+   +-----------+         |
       * CLOSING  |ws.close()|<--|close frame|<--+-----+       CLOSING
       *          +----------+   +-----------+   |
       *    |           |                        |   +---+        |
       *                +------------------------+-->|fin| - - - -
       *    |         +---+                      |   +---+
       *     - - - - -|fin|<---------------------+
       *              +---+
       *
       * @param {Number} [code] Status code explaining why the connection is closing
       * @param {(String|Buffer)} [data] The reason why the connection is
       *     closing
       * @public
       */
      close(code, data) {
        if (this.readyState === _WebSocket.CLOSED) return;
        if (this.readyState === _WebSocket.CONNECTING) {
          const msg = "WebSocket was closed before the connection was established";
          abortHandshake(this, this._req, msg);
          return;
        }
        if (this.readyState === _WebSocket.CLOSING) {
          if (this._closeFrameSent && (this._closeFrameReceived || this._receiver._writableState.errorEmitted)) {
            this._socket.end();
          }
          return;
        }
        this._readyState = _WebSocket.CLOSING;
        this._sender.close(code, data, !this._isServer, (err) => {
          if (err) return;
          this._closeFrameSent = true;
          if (this._closeFrameReceived || this._receiver._writableState.errorEmitted) {
            this._socket.end();
          }
        });
        setCloseTimer(this);
      }
      /**
       * Pause the socket.
       *
       * @public
       */
      pause() {
        if (this.readyState === _WebSocket.CONNECTING || this.readyState === _WebSocket.CLOSED) {
          return;
        }
        this._paused = true;
        this._socket.pause();
      }
      /**
       * Send a ping.
       *
       * @param {*} [data] The data to send
       * @param {Boolean} [mask] Indicates whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when the ping is sent
       * @public
       */
      ping(data, mask, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof data === "function") {
          cb = data;
          data = mask = void 0;
        } else if (typeof mask === "function") {
          cb = mask;
          mask = void 0;
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        if (mask === void 0) mask = !this._isServer;
        this._sender.ping(data || EMPTY_BUFFER, mask, cb);
      }
      /**
       * Send a pong.
       *
       * @param {*} [data] The data to send
       * @param {Boolean} [mask] Indicates whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when the pong is sent
       * @public
       */
      pong(data, mask, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof data === "function") {
          cb = data;
          data = mask = void 0;
        } else if (typeof mask === "function") {
          cb = mask;
          mask = void 0;
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        if (mask === void 0) mask = !this._isServer;
        this._sender.pong(data || EMPTY_BUFFER, mask, cb);
      }
      /**
       * Resume the socket.
       *
       * @public
       */
      resume() {
        if (this.readyState === _WebSocket.CONNECTING || this.readyState === _WebSocket.CLOSED) {
          return;
        }
        this._paused = false;
        if (!this._receiver._writableState.needDrain) this._socket.resume();
      }
      /**
       * Send a data message.
       *
       * @param {*} data The message to send
       * @param {Object} [options] Options object
       * @param {Boolean} [options.binary] Specifies whether `data` is binary or
       *     text
       * @param {Boolean} [options.compress] Specifies whether or not to compress
       *     `data`
       * @param {Boolean} [options.fin=true] Specifies whether the fragment is the
       *     last one
       * @param {Boolean} [options.mask] Specifies whether or not to mask `data`
       * @param {Function} [cb] Callback which is executed when data is written out
       * @public
       */
      send(data, options, cb) {
        if (this.readyState === _WebSocket.CONNECTING) {
          throw new Error("WebSocket is not open: readyState 0 (CONNECTING)");
        }
        if (typeof options === "function") {
          cb = options;
          options = {};
        }
        if (typeof data === "number") data = data.toString();
        if (this.readyState !== _WebSocket.OPEN) {
          sendAfterClose(this, data, cb);
          return;
        }
        const opts = {
          binary: typeof data !== "string",
          mask: !this._isServer,
          compress: true,
          fin: true,
          ...options
        };
        if (!this._extensions[PerMessageDeflate2.extensionName]) {
          opts.compress = false;
        }
        this._sender.send(data || EMPTY_BUFFER, opts, cb);
      }
      /**
       * Forcibly close the connection.
       *
       * @public
       */
      terminate() {
        if (this.readyState === _WebSocket.CLOSED) return;
        if (this.readyState === _WebSocket.CONNECTING) {
          const msg = "WebSocket was closed before the connection was established";
          abortHandshake(this, this._req, msg);
          return;
        }
        if (this._socket) {
          this._readyState = _WebSocket.CLOSING;
          this._socket.destroy();
        }
      }
    };
    Object.defineProperty(WebSocket2, "CONNECTING", {
      enumerable: true,
      value: readyStates.indexOf("CONNECTING")
    });
    Object.defineProperty(WebSocket2.prototype, "CONNECTING", {
      enumerable: true,
      value: readyStates.indexOf("CONNECTING")
    });
    Object.defineProperty(WebSocket2, "OPEN", {
      enumerable: true,
      value: readyStates.indexOf("OPEN")
    });
    Object.defineProperty(WebSocket2.prototype, "OPEN", {
      enumerable: true,
      value: readyStates.indexOf("OPEN")
    });
    Object.defineProperty(WebSocket2, "CLOSING", {
      enumerable: true,
      value: readyStates.indexOf("CLOSING")
    });
    Object.defineProperty(WebSocket2.prototype, "CLOSING", {
      enumerable: true,
      value: readyStates.indexOf("CLOSING")
    });
    Object.defineProperty(WebSocket2, "CLOSED", {
      enumerable: true,
      value: readyStates.indexOf("CLOSED")
    });
    Object.defineProperty(WebSocket2.prototype, "CLOSED", {
      enumerable: true,
      value: readyStates.indexOf("CLOSED")
    });
    [
      "binaryType",
      "bufferedAmount",
      "extensions",
      "isPaused",
      "protocol",
      "readyState",
      "url"
    ].forEach((property) => {
      Object.defineProperty(WebSocket2.prototype, property, { enumerable: true });
    });
    ["open", "error", "close", "message"].forEach((method) => {
      Object.defineProperty(WebSocket2.prototype, `on${method}`, {
        enumerable: true,
        get() {
          for (const listener of this.listeners(method)) {
            if (listener[kForOnEventAttribute]) return listener[kListener];
          }
          return null;
        },
        set(handler) {
          for (const listener of this.listeners(method)) {
            if (listener[kForOnEventAttribute]) {
              this.removeListener(method, listener);
              break;
            }
          }
          if (typeof handler !== "function") return;
          this.addEventListener(method, handler, {
            [kForOnEventAttribute]: true
          });
        }
      });
    });
    WebSocket2.prototype.addEventListener = addEventListener;
    WebSocket2.prototype.removeEventListener = removeEventListener;
    module2.exports = WebSocket2;
    function initAsClient(websocket, address, protocols, options) {
      const opts = {
        allowSynchronousEvents: true,
        autoPong: true,
        closeTimeout: CLOSE_TIMEOUT,
        protocolVersion: protocolVersions[1],
        maxBufferedChunks: 256 * 1024,
        maxFragments: 16 * 1024,
        maxPayload: 100 * 1024 * 1024,
        skipUTF8Validation: false,
        perMessageDeflate: true,
        followRedirects: false,
        maxRedirects: 10,
        ...options,
        socketPath: void 0,
        hostname: void 0,
        protocol: void 0,
        timeout: void 0,
        method: "GET",
        host: void 0,
        path: void 0,
        port: void 0
      };
      websocket._autoPong = opts.autoPong;
      websocket._closeTimeout = opts.closeTimeout;
      if (!protocolVersions.includes(opts.protocolVersion)) {
        throw new RangeError(
          `Unsupported protocol version: ${opts.protocolVersion} (supported versions: ${protocolVersions.join(", ")})`
        );
      }
      let parsedUrl;
      if (address instanceof URL2) {
        parsedUrl = address;
      } else {
        try {
          parsedUrl = new URL2(address);
        } catch {
          throw new SyntaxError(`Invalid URL: ${address}`);
        }
      }
      if (parsedUrl.protocol === "http:") {
        parsedUrl.protocol = "ws:";
      } else if (parsedUrl.protocol === "https:") {
        parsedUrl.protocol = "wss:";
      }
      websocket._url = parsedUrl.href;
      const isSecure = parsedUrl.protocol === "wss:";
      const isIpcUrl = parsedUrl.protocol === "ws+unix:";
      let invalidUrlMessage;
      if (parsedUrl.protocol !== "ws:" && !isSecure && !isIpcUrl) {
        invalidUrlMessage = `The URL's protocol must be one of "ws:", "wss:", "http:", "https:", or "ws+unix:"`;
      } else if (isIpcUrl && !parsedUrl.pathname) {
        invalidUrlMessage = "The URL's pathname is empty";
      } else if (parsedUrl.hash) {
        invalidUrlMessage = "The URL contains a fragment identifier";
      }
      if (invalidUrlMessage) {
        const err = new SyntaxError(invalidUrlMessage);
        if (websocket._redirects === 0) {
          throw err;
        } else {
          emitErrorAndClose(websocket, err);
          return;
        }
      }
      const defaultPort = isSecure ? 443 : 80;
      const key = randomBytes(16).toString("base64");
      const request = isSecure ? https.request : http.request;
      const protocolSet = /* @__PURE__ */ new Set();
      let perMessageDeflate;
      opts.createConnection = opts.createConnection || (isSecure ? tlsConnect : netConnect);
      opts.defaultPort = opts.defaultPort || defaultPort;
      opts.port = parsedUrl.port || defaultPort;
      opts.host = parsedUrl.hostname.startsWith("[") ? parsedUrl.hostname.slice(1, -1) : parsedUrl.hostname;
      opts.headers = {
        ...opts.headers,
        "Sec-WebSocket-Version": opts.protocolVersion,
        "Sec-WebSocket-Key": key,
        Connection: "Upgrade",
        Upgrade: "websocket"
      };
      opts.path = parsedUrl.pathname + parsedUrl.search;
      opts.timeout = opts.handshakeTimeout;
      if (opts.perMessageDeflate) {
        perMessageDeflate = new PerMessageDeflate2({
          ...opts.perMessageDeflate,
          isServer: false,
          maxPayload: opts.maxPayload
        });
        opts.headers["Sec-WebSocket-Extensions"] = format({
          [PerMessageDeflate2.extensionName]: perMessageDeflate.offer()
        });
      }
      if (protocols.length) {
        for (const protocol of protocols) {
          if (typeof protocol !== "string" || !subprotocolRegex.test(protocol) || protocolSet.has(protocol)) {
            throw new SyntaxError(
              "An invalid or duplicated subprotocol was specified"
            );
          }
          protocolSet.add(protocol);
        }
        opts.headers["Sec-WebSocket-Protocol"] = protocols.join(",");
      }
      if (opts.origin) {
        if (opts.protocolVersion < 13) {
          opts.headers["Sec-WebSocket-Origin"] = opts.origin;
        } else {
          opts.headers.Origin = opts.origin;
        }
      }
      if (parsedUrl.username || parsedUrl.password) {
        opts.auth = `${parsedUrl.username}:${parsedUrl.password}`;
      }
      if (isIpcUrl) {
        const parts = opts.path.split(":");
        opts.socketPath = parts[0];
        opts.path = parts[1];
      }
      let req;
      if (opts.followRedirects) {
        if (websocket._redirects === 0) {
          websocket._originalIpc = isIpcUrl;
          websocket._originalSecure = isSecure;
          websocket._originalHostOrSocketPath = isIpcUrl ? opts.socketPath : parsedUrl.host;
          const headers = options && options.headers;
          options = { ...options, headers: {} };
          if (headers) {
            for (const [key2, value] of Object.entries(headers)) {
              options.headers[key2.toLowerCase()] = value;
            }
          }
        } else if (websocket.listenerCount("redirect") === 0) {
          const isSameHost = isIpcUrl ? websocket._originalIpc ? opts.socketPath === websocket._originalHostOrSocketPath : false : websocket._originalIpc ? false : parsedUrl.host === websocket._originalHostOrSocketPath;
          if (!isSameHost || websocket._originalSecure && !isSecure) {
            delete opts.headers.authorization;
            delete opts.headers.cookie;
            if (!isSameHost) delete opts.headers.host;
            opts.auth = void 0;
          }
        }
        if (opts.auth && !options.headers.authorization) {
          options.headers.authorization = "Basic " + Buffer.from(opts.auth).toString("base64");
        }
        req = websocket._req = request(opts);
        if (websocket._redirects) {
          websocket.emit("redirect", websocket.url, req);
        }
      } else {
        req = websocket._req = request(opts);
      }
      if (opts.timeout) {
        req.on("timeout", () => {
          abortHandshake(websocket, req, "Opening handshake has timed out");
        });
      }
      req.on("error", (err) => {
        if (req === null || req[kAborted]) return;
        req = websocket._req = null;
        emitErrorAndClose(websocket, err);
      });
      req.on("response", (res) => {
        const location = res.headers.location;
        const statusCode = res.statusCode;
        if (location && opts.followRedirects && statusCode >= 300 && statusCode < 400) {
          if (++websocket._redirects > opts.maxRedirects) {
            abortHandshake(websocket, req, "Maximum redirects exceeded");
            return;
          }
          req.abort();
          let addr;
          try {
            addr = new URL2(location, address);
          } catch (e) {
            const err = new SyntaxError(`Invalid URL: ${location}`);
            emitErrorAndClose(websocket, err);
            return;
          }
          initAsClient(websocket, addr, protocols, options);
        } else if (!websocket.emit("unexpected-response", req, res)) {
          abortHandshake(
            websocket,
            req,
            `Unexpected server response: ${res.statusCode}`
          );
        }
      });
      req.on("upgrade", (res, socket, head) => {
        websocket.emit("upgrade", res);
        if (websocket.readyState !== WebSocket2.CONNECTING) return;
        req = websocket._req = null;
        const upgrade = res.headers.upgrade;
        if (upgrade === void 0 || upgrade.toLowerCase() !== "websocket") {
          abortHandshake(websocket, socket, "Invalid Upgrade header");
          return;
        }
        const digest = createHash("sha1").update(key + GUID).digest("base64");
        if (res.headers["sec-websocket-accept"] !== digest) {
          abortHandshake(websocket, socket, "Invalid Sec-WebSocket-Accept header");
          return;
        }
        const serverProt = res.headers["sec-websocket-protocol"];
        let protError;
        if (serverProt !== void 0) {
          if (!protocolSet.size) {
            protError = "Server sent a subprotocol but none was requested";
          } else if (!protocolSet.has(serverProt)) {
            protError = "Server sent an invalid subprotocol";
          }
        } else if (protocolSet.size) {
          protError = "Server sent no subprotocol";
        }
        if (protError) {
          abortHandshake(websocket, socket, protError);
          return;
        }
        if (serverProt) websocket._protocol = serverProt;
        const secWebSocketExtensions = res.headers["sec-websocket-extensions"];
        if (secWebSocketExtensions !== void 0) {
          if (!perMessageDeflate) {
            const message = "Server sent a Sec-WebSocket-Extensions header but no extension was requested";
            abortHandshake(websocket, socket, message);
            return;
          }
          let extensions;
          try {
            extensions = parse(secWebSocketExtensions);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Extensions header";
            abortHandshake(websocket, socket, message);
            return;
          }
          const extensionNames = Object.keys(extensions);
          if (extensionNames.length !== 1 || extensionNames[0] !== PerMessageDeflate2.extensionName) {
            const message = "Server indicated an extension that was not requested";
            abortHandshake(websocket, socket, message);
            return;
          }
          try {
            perMessageDeflate.accept(extensions[PerMessageDeflate2.extensionName]);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Extensions header";
            abortHandshake(websocket, socket, message);
            return;
          }
          websocket._extensions[PerMessageDeflate2.extensionName] = perMessageDeflate;
        }
        websocket.setSocket(socket, head, {
          allowSynchronousEvents: opts.allowSynchronousEvents,
          generateMask: opts.generateMask,
          maxBufferedChunks: opts.maxBufferedChunks,
          maxFragments: opts.maxFragments,
          maxPayload: opts.maxPayload,
          skipUTF8Validation: opts.skipUTF8Validation
        });
      });
      if (opts.finishRequest) {
        opts.finishRequest(req, websocket);
      } else {
        req.end();
      }
    }
    function emitErrorAndClose(websocket, err) {
      websocket._readyState = WebSocket2.CLOSING;
      websocket._errorEmitted = true;
      websocket.emit("error", err);
      websocket.emitClose();
    }
    function netConnect(options) {
      options.path = options.socketPath;
      return net2.connect(options);
    }
    function tlsConnect(options) {
      options.path = void 0;
      if (!options.servername && options.servername !== "") {
        options.servername = net2.isIP(options.host) ? "" : options.host;
      }
      return tls.connect(options);
    }
    function abortHandshake(websocket, stream, message) {
      websocket._readyState = WebSocket2.CLOSING;
      const err = new Error(message);
      Error.captureStackTrace(err, abortHandshake);
      if (stream.setHeader) {
        stream[kAborted] = true;
        stream.abort();
        if (stream.socket && !stream.socket.destroyed) {
          stream.socket.destroy();
        }
        process.nextTick(emitErrorAndClose, websocket, err);
      } else {
        stream.destroy(err);
        stream.once("error", websocket.emit.bind(websocket, "error"));
        stream.once("close", websocket.emitClose.bind(websocket));
      }
    }
    function sendAfterClose(websocket, data, cb) {
      if (data) {
        const length = isBlob(data) ? data.size : toBuffer(data).length;
        if (websocket._socket) websocket._sender._bufferedBytes += length;
        else websocket._bufferedAmount += length;
      }
      if (cb) {
        const err = new Error(
          `WebSocket is not open: readyState ${websocket.readyState} (${readyStates[websocket.readyState]})`
        );
        process.nextTick(cb, err);
      }
    }
    function receiverOnConclude(code, reason) {
      const websocket = this[kWebSocket];
      websocket._closeFrameReceived = true;
      websocket._closeMessage = reason;
      websocket._closeCode = code;
      if (websocket._socket[kWebSocket] === void 0) return;
      websocket._socket.removeListener("data", socketOnData);
      process.nextTick(resume, websocket._socket);
      if (code === 1005) websocket.close();
      else websocket.close(code, reason);
    }
    function receiverOnDrain() {
      const websocket = this[kWebSocket];
      if (!websocket.isPaused) websocket._socket.resume();
    }
    function receiverOnError(err) {
      const websocket = this[kWebSocket];
      if (websocket._socket[kWebSocket] !== void 0) {
        websocket._socket.removeListener("data", socketOnData);
        process.nextTick(resume, websocket._socket);
        websocket.close(err[kStatusCode]);
      }
      if (!websocket._errorEmitted) {
        websocket._errorEmitted = true;
        websocket.emit("error", err);
      }
    }
    function receiverOnFinish() {
      this[kWebSocket].emitClose();
    }
    function receiverOnMessage(data, isBinary) {
      this[kWebSocket].emit("message", data, isBinary);
    }
    function receiverOnPing(data) {
      const websocket = this[kWebSocket];
      if (websocket._autoPong) websocket.pong(data, !this._isServer, NOOP);
      websocket.emit("ping", data);
    }
    function receiverOnPong(data) {
      this[kWebSocket].emit("pong", data);
    }
    function resume(stream) {
      stream.resume();
    }
    function senderOnError(err) {
      const websocket = this[kWebSocket];
      if (websocket.readyState === WebSocket2.CLOSED) return;
      if (websocket.readyState === WebSocket2.OPEN) {
        websocket._readyState = WebSocket2.CLOSING;
        setCloseTimer(websocket);
      }
      this._socket.end();
      if (!websocket._errorEmitted) {
        websocket._errorEmitted = true;
        websocket.emit("error", err);
      }
    }
    function setCloseTimer(websocket) {
      websocket._closeTimer = setTimeout(
        websocket._socket.destroy.bind(websocket._socket),
        websocket._closeTimeout
      );
    }
    function socketOnClose() {
      const websocket = this[kWebSocket];
      this.removeListener("close", socketOnClose);
      this.removeListener("data", socketOnData);
      this.removeListener("end", socketOnEnd);
      websocket._readyState = WebSocket2.CLOSING;
      if (!this._readableState.endEmitted && !websocket._closeFrameReceived && !websocket._receiver._writableState.errorEmitted && this._readableState.length !== 0) {
        const chunk = this.read(this._readableState.length);
        websocket._receiver.write(chunk);
      }
      websocket._receiver.end();
      this[kWebSocket] = void 0;
      clearTimeout(websocket._closeTimer);
      if (websocket._receiver._writableState.finished || websocket._receiver._writableState.errorEmitted) {
        websocket.emitClose();
      } else {
        websocket._receiver.on("error", receiverOnFinish);
        websocket._receiver.on("finish", receiverOnFinish);
      }
    }
    function socketOnData(chunk) {
      if (!this[kWebSocket]._receiver.write(chunk)) {
        this.pause();
      }
    }
    function socketOnEnd() {
      const websocket = this[kWebSocket];
      websocket._readyState = WebSocket2.CLOSING;
      websocket._receiver.end();
      this.end();
    }
    function socketOnError() {
      const websocket = this[kWebSocket];
      this.removeListener("error", socketOnError);
      this.on("error", NOOP);
      if (websocket) {
        websocket._readyState = WebSocket2.CLOSING;
        this.destroy();
      }
    }
  }
});

// ../../node_modules/.pnpm/ws@8.21.2/node_modules/ws/lib/stream.js
var require_stream = __commonJS({
  "../../node_modules/.pnpm/ws@8.21.2/node_modules/ws/lib/stream.js"(exports2, module2) {
    "use strict";
    var WebSocket2 = require_websocket();
    var { Duplex } = require("stream");
    function emitClose(stream) {
      stream.emit("close");
    }
    function duplexOnEnd() {
      if (!this.destroyed && this._writableState.finished) {
        this.destroy();
      }
    }
    function duplexOnError(err) {
      this.removeListener("error", duplexOnError);
      this.destroy();
      if (this.listenerCount("error") === 0) {
        this.emit("error", err);
      }
    }
    function createWebSocketStream2(ws, options) {
      let terminateOnDestroy = true;
      const duplex = new Duplex({
        ...options,
        autoDestroy: false,
        emitClose: false,
        objectMode: false,
        writableObjectMode: false
      });
      ws.on("message", function message(msg, isBinary) {
        const data = !isBinary && duplex._readableState.objectMode ? msg.toString() : msg;
        if (!duplex.push(data)) ws.pause();
      });
      ws.once("error", function error(err) {
        if (duplex.destroyed) return;
        terminateOnDestroy = false;
        duplex.destroy(err);
      });
      ws.once("close", function close() {
        if (duplex.destroyed) return;
        duplex.push(null);
      });
      duplex._destroy = function(err, callback) {
        if (ws.readyState === ws.CLOSED) {
          callback(err);
          process.nextTick(emitClose, duplex);
          return;
        }
        let called = false;
        ws.once("error", function error(err2) {
          called = true;
          callback(err2);
        });
        ws.once("close", function close() {
          if (!called) callback(err);
          process.nextTick(emitClose, duplex);
        });
        if (terminateOnDestroy) ws.terminate();
      };
      duplex._final = function(callback) {
        if (ws.readyState === ws.CONNECTING) {
          ws.once("open", function open() {
            duplex._final(callback);
          });
          return;
        }
        if (ws._socket === null) return;
        if (ws._socket._writableState.finished) {
          callback();
          if (duplex._readableState.endEmitted) duplex.destroy();
        } else {
          ws._socket.once("finish", function finish() {
            callback();
          });
          ws.close();
        }
      };
      duplex._read = function() {
        if (ws.isPaused) ws.resume();
      };
      duplex._write = function(chunk, encoding, callback) {
        if (ws.readyState === ws.CONNECTING) {
          ws.once("open", function open() {
            duplex._write(chunk, encoding, callback);
          });
          return;
        }
        ws.send(chunk, callback);
      };
      duplex.on("end", duplexOnEnd);
      duplex.on("error", duplexOnError);
      return duplex;
    }
    module2.exports = createWebSocketStream2;
  }
});

// ../../node_modules/.pnpm/ws@8.21.2/node_modules/ws/lib/subprotocol.js
var require_subprotocol = __commonJS({
  "../../node_modules/.pnpm/ws@8.21.2/node_modules/ws/lib/subprotocol.js"(exports2, module2) {
    "use strict";
    var { tokenChars } = require_validation();
    function parse(header) {
      const protocols = /* @__PURE__ */ new Set();
      let start = -1;
      let end = -1;
      let i = 0;
      for (i; i < header.length; i++) {
        const code = header.charCodeAt(i);
        if (end === -1 && tokenChars[code] === 1) {
          if (start === -1) start = i;
        } else if (i !== 0 && (code === 32 || code === 9)) {
          if (end === -1 && start !== -1) end = i;
        } else if (code === 44) {
          if (start === -1) {
            throw new SyntaxError(`Unexpected character at index ${i}`);
          }
          if (end === -1) end = i;
          const protocol2 = header.slice(start, end);
          if (protocols.has(protocol2)) {
            throw new SyntaxError(`The "${protocol2}" subprotocol is duplicated`);
          }
          protocols.add(protocol2);
          start = end = -1;
        } else {
          throw new SyntaxError(`Unexpected character at index ${i}`);
        }
      }
      if (start === -1 || end !== -1) {
        throw new SyntaxError("Unexpected end of input");
      }
      const protocol = header.slice(start, i);
      if (protocols.has(protocol)) {
        throw new SyntaxError(`The "${protocol}" subprotocol is duplicated`);
      }
      protocols.add(protocol);
      return protocols;
    }
    module2.exports = { parse };
  }
});

// ../../node_modules/.pnpm/ws@8.21.2/node_modules/ws/lib/websocket-server.js
var require_websocket_server = __commonJS({
  "../../node_modules/.pnpm/ws@8.21.2/node_modules/ws/lib/websocket-server.js"(exports2, module2) {
    "use strict";
    var EventEmitter = require("events");
    var http = require("http");
    var { Duplex } = require("stream");
    var { createHash } = require("crypto");
    var extension2 = require_extension();
    var PerMessageDeflate2 = require_permessage_deflate();
    var subprotocol2 = require_subprotocol();
    var WebSocket2 = require_websocket();
    var { CLOSE_TIMEOUT, GUID, kWebSocket } = require_constants();
    var keyRegex = /^[+/0-9A-Za-z]{22}==$/;
    var RUNNING = 0;
    var CLOSING = 1;
    var CLOSED = 2;
    var WebSocketServer2 = class extends EventEmitter {
      /**
       * Create a `WebSocketServer` instance.
       *
       * @param {Object} options Configuration options
       * @param {Boolean} [options.allowSynchronousEvents=true] Specifies whether
       *     any of the `'message'`, `'ping'`, and `'pong'` events can be emitted
       *     multiple times in the same tick
       * @param {Boolean} [options.autoPong=true] Specifies whether or not to
       *     automatically send a pong in response to a ping
       * @param {Number} [options.backlog=511] The maximum length of the queue of
       *     pending connections
       * @param {Boolean} [options.clientTracking=true] Specifies whether or not to
       *     track clients
       * @param {Number} [options.closeTimeout=30000] Duration in milliseconds to
       *     wait for the closing handshake to finish after `websocket.close()` is
       *     called
       * @param {Function} [options.handleProtocols] A hook to handle protocols
       * @param {String} [options.host] The hostname where to bind the server
       * @param {Number} [options.maxBufferedChunks=262144] The maximum number of
       *     buffered data chunks
       * @param {Number} [options.maxFragments=16384] The maximum number of message
       *     fragments
       * @param {Number} [options.maxPayload=104857600] The maximum allowed message
       *     size
       * @param {Boolean} [options.noServer=false] Enable no server mode
       * @param {String} [options.path] Accept only connections matching this path
       * @param {(Boolean|Object)} [options.perMessageDeflate=false] Enable/disable
       *     permessage-deflate
       * @param {Number} [options.port] The port where to bind the server
       * @param {(http.Server|https.Server)} [options.server] A pre-created HTTP/S
       *     server to use
       * @param {Boolean} [options.skipUTF8Validation=false] Specifies whether or
       *     not to skip UTF-8 validation for text and close messages
       * @param {Function} [options.verifyClient] A hook to reject connections
       * @param {Function} [options.WebSocket=WebSocket] Specifies the `WebSocket`
       *     class to use. It must be the `WebSocket` class or class that extends it
       * @param {Function} [callback] A listener for the `listening` event
       */
      constructor(options, callback) {
        super();
        options = {
          allowSynchronousEvents: true,
          autoPong: true,
          maxBufferedChunks: 256 * 1024,
          maxFragments: 16 * 1024,
          maxPayload: 100 * 1024 * 1024,
          skipUTF8Validation: false,
          perMessageDeflate: false,
          handleProtocols: null,
          clientTracking: true,
          closeTimeout: CLOSE_TIMEOUT,
          verifyClient: null,
          noServer: false,
          backlog: null,
          // use default (511 as implemented in net.js)
          server: null,
          host: null,
          path: null,
          port: null,
          WebSocket: WebSocket2,
          ...options
        };
        if (options.port == null && !options.server && !options.noServer || options.port != null && (options.server || options.noServer) || options.server && options.noServer) {
          throw new TypeError(
            'One and only one of the "port", "server", or "noServer" options must be specified'
          );
        }
        if (options.port != null) {
          this._server = http.createServer((req, res) => {
            const body = http.STATUS_CODES[426];
            res.writeHead(426, {
              "Content-Length": body.length,
              "Content-Type": "text/plain"
            });
            res.end(body);
          });
          this._server.listen(
            options.port,
            options.host,
            options.backlog,
            callback
          );
        } else if (options.server) {
          this._server = options.server;
        }
        if (this._server) {
          const emitConnection = this.emit.bind(this, "connection");
          this._removeListeners = addListeners(this._server, {
            listening: this.emit.bind(this, "listening"),
            error: this.emit.bind(this, "error"),
            upgrade: (req, socket, head) => {
              this.handleUpgrade(req, socket, head, emitConnection);
            }
          });
        }
        if (options.perMessageDeflate === true) options.perMessageDeflate = {};
        if (options.clientTracking) {
          this.clients = /* @__PURE__ */ new Set();
          this._shouldEmitClose = false;
        }
        this.options = options;
        this._state = RUNNING;
      }
      /**
       * Returns the bound address, the address family name, and port of the server
       * as reported by the operating system if listening on an IP socket.
       * If the server is listening on a pipe or UNIX domain socket, the name is
       * returned as a string.
       *
       * @return {(Object|String|null)} The address of the server
       * @public
       */
      address() {
        if (this.options.noServer) {
          throw new Error('The server is operating in "noServer" mode');
        }
        if (!this._server) return null;
        return this._server.address();
      }
      /**
       * Stop the server from accepting new connections and emit the `'close'` event
       * when all existing connections are closed.
       *
       * @param {Function} [cb] A one-time listener for the `'close'` event
       * @public
       */
      close(cb) {
        if (this._state === CLOSED) {
          if (cb) {
            this.once("close", () => {
              cb(new Error("The server is not running"));
            });
          }
          process.nextTick(emitClose, this);
          return;
        }
        if (cb) this.once("close", cb);
        if (this._state === CLOSING) return;
        this._state = CLOSING;
        if (this.options.noServer || this.options.server) {
          if (this._server) {
            this._removeListeners();
            this._removeListeners = this._server = null;
          }
          if (this.clients) {
            if (!this.clients.size) {
              process.nextTick(emitClose, this);
            } else {
              this._shouldEmitClose = true;
            }
          } else {
            process.nextTick(emitClose, this);
          }
        } else {
          const server = this._server;
          this._removeListeners();
          this._removeListeners = this._server = null;
          server.close(() => {
            emitClose(this);
          });
        }
      }
      /**
       * See if a given request should be handled by this server instance.
       *
       * @param {http.IncomingMessage} req Request object to inspect
       * @return {Boolean} `true` if the request is valid, else `false`
       * @public
       */
      shouldHandle(req) {
        if (this.options.path) {
          const index = req.url.indexOf("?");
          const pathname = index !== -1 ? req.url.slice(0, index) : req.url;
          if (pathname !== this.options.path) return false;
        }
        return true;
      }
      /**
       * Handle a HTTP Upgrade request.
       *
       * @param {http.IncomingMessage} req The request object
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Function} cb Callback
       * @public
       */
      handleUpgrade(req, socket, head, cb) {
        socket.on("error", socketOnError);
        const key = req.headers["sec-websocket-key"];
        const upgrade = req.headers.upgrade;
        const version = +req.headers["sec-websocket-version"];
        if (req.method !== "GET") {
          const message = "Invalid HTTP method";
          abortHandshakeOrEmitwsClientError(this, req, socket, 405, message);
          return;
        }
        if (upgrade === void 0 || upgrade.toLowerCase() !== "websocket") {
          const message = "Invalid Upgrade header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
          return;
        }
        if (key === void 0 || !keyRegex.test(key)) {
          const message = "Missing or invalid Sec-WebSocket-Key header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
          return;
        }
        if (version !== 13 && version !== 8) {
          const message = "Missing or invalid Sec-WebSocket-Version header";
          abortHandshakeOrEmitwsClientError(this, req, socket, 400, message, {
            "Sec-WebSocket-Version": "13, 8"
          });
          return;
        }
        if (!this.shouldHandle(req)) {
          abortHandshake(socket, 400);
          return;
        }
        const secWebSocketProtocol = req.headers["sec-websocket-protocol"];
        let protocols = /* @__PURE__ */ new Set();
        if (secWebSocketProtocol !== void 0) {
          try {
            protocols = subprotocol2.parse(secWebSocketProtocol);
          } catch (err) {
            const message = "Invalid Sec-WebSocket-Protocol header";
            abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
            return;
          }
        }
        const secWebSocketExtensions = req.headers["sec-websocket-extensions"];
        const extensions = {};
        if (this.options.perMessageDeflate && secWebSocketExtensions !== void 0) {
          const perMessageDeflate = new PerMessageDeflate2({
            ...this.options.perMessageDeflate,
            isServer: true,
            maxPayload: this.options.maxPayload
          });
          try {
            const offers = extension2.parse(secWebSocketExtensions);
            if (offers[PerMessageDeflate2.extensionName]) {
              perMessageDeflate.accept(offers[PerMessageDeflate2.extensionName]);
              extensions[PerMessageDeflate2.extensionName] = perMessageDeflate;
            }
          } catch (err) {
            const message = "Invalid or unacceptable Sec-WebSocket-Extensions header";
            abortHandshakeOrEmitwsClientError(this, req, socket, 400, message);
            return;
          }
        }
        if (this.options.verifyClient) {
          const info = {
            origin: req.headers[`${version === 8 ? "sec-websocket-origin" : "origin"}`],
            secure: !!(req.socket.authorized || req.socket.encrypted),
            req
          };
          if (this.options.verifyClient.length === 2) {
            this.options.verifyClient(info, (verified, code, message, headers) => {
              if (!verified) {
                return abortHandshake(socket, code || 401, message, headers);
              }
              this.completeUpgrade(
                extensions,
                key,
                protocols,
                req,
                socket,
                head,
                cb
              );
            });
            return;
          }
          if (!this.options.verifyClient(info)) return abortHandshake(socket, 401);
        }
        this.completeUpgrade(extensions, key, protocols, req, socket, head, cb);
      }
      /**
       * Upgrade the connection to WebSocket.
       *
       * @param {Object} extensions The accepted extensions
       * @param {String} key The value of the `Sec-WebSocket-Key` header
       * @param {Set} protocols The subprotocols
       * @param {http.IncomingMessage} req The request object
       * @param {Duplex} socket The network socket between the server and client
       * @param {Buffer} head The first packet of the upgraded stream
       * @param {Function} cb Callback
       * @throws {Error} If called more than once with the same socket
       * @private
       */
      completeUpgrade(extensions, key, protocols, req, socket, head, cb) {
        if (!socket.readable || !socket.writable) return socket.destroy();
        if (socket[kWebSocket]) {
          throw new Error(
            "server.handleUpgrade() was called more than once with the same socket, possibly due to a misconfiguration"
          );
        }
        if (this._state > RUNNING) return abortHandshake(socket, 503);
        const digest = createHash("sha1").update(key + GUID).digest("base64");
        const headers = [
          "HTTP/1.1 101 Switching Protocols",
          "Upgrade: websocket",
          "Connection: Upgrade",
          `Sec-WebSocket-Accept: ${digest}`
        ];
        const ws = new this.options.WebSocket(null, void 0, this.options);
        if (protocols.size) {
          const protocol = this.options.handleProtocols ? this.options.handleProtocols(protocols, req) : protocols.values().next().value;
          if (protocol) {
            headers.push(`Sec-WebSocket-Protocol: ${protocol}`);
            ws._protocol = protocol;
          }
        }
        if (extensions[PerMessageDeflate2.extensionName]) {
          const params = extensions[PerMessageDeflate2.extensionName].params;
          const value = extension2.format({
            [PerMessageDeflate2.extensionName]: [params]
          });
          headers.push(`Sec-WebSocket-Extensions: ${value}`);
          ws._extensions = extensions;
        }
        this.emit("headers", headers, req);
        socket.write(headers.concat("\r\n").join("\r\n"));
        socket.removeListener("error", socketOnError);
        ws.setSocket(socket, head, {
          allowSynchronousEvents: this.options.allowSynchronousEvents,
          maxBufferedChunks: this.options.maxBufferedChunks,
          maxFragments: this.options.maxFragments,
          maxPayload: this.options.maxPayload,
          skipUTF8Validation: this.options.skipUTF8Validation
        });
        if (this.clients) {
          this.clients.add(ws);
          ws.on("close", () => {
            this.clients.delete(ws);
            if (this._shouldEmitClose && !this.clients.size) {
              process.nextTick(emitClose, this);
            }
          });
        }
        cb(ws, req);
      }
    };
    module2.exports = WebSocketServer2;
    function addListeners(server, map) {
      for (const event of Object.keys(map)) server.on(event, map[event]);
      return function removeListeners() {
        for (const event of Object.keys(map)) {
          server.removeListener(event, map[event]);
        }
      };
    }
    function emitClose(server) {
      server._state = CLOSED;
      server.emit("close");
    }
    function socketOnError() {
      this.destroy();
    }
    function abortHandshake(socket, code, message, headers) {
      message = message || http.STATUS_CODES[code];
      headers = {
        Connection: "close",
        "Content-Type": "text/html",
        "Content-Length": Buffer.byteLength(message),
        ...headers
      };
      socket.once("finish", socket.destroy);
      socket.end(
        `HTTP/1.1 ${code} ${http.STATUS_CODES[code]}\r
` + Object.keys(headers).map((h) => `${h}: ${headers[h]}`).join("\r\n") + "\r\n\r\n" + message
      );
    }
    function abortHandshakeOrEmitwsClientError(server, req, socket, code, message, headers) {
      if (server.listenerCount("wsClientError")) {
        const err = new Error(message);
        Error.captureStackTrace(err, abortHandshakeOrEmitwsClientError);
        server.emit("wsClientError", err, socket, req);
      } else {
        abortHandshake(socket, code, message, headers);
      }
    }
  }
});

// src/main.ts
var main_exports = {};
__export(main_exports, {
  default: () => OmniCollectorPlugin
});
module.exports = __toCommonJS(main_exports);
var import_node_path = __toESM(require("node:path"), 1);
var import_obsidian10 = require("obsidian");
var import_node_crypto2 = require("node:crypto");

// src/settings.ts
var DEFAULT_SETTINGS = {
  dataDir: "",
  engineScript: "",
  wsToken: "",
  makerworldSyncLikes: false,
  nodeBin: "",
  aiEnabled: false,
  aiProvider: "deepseek",
  aiApiKey: "",
  aiModel: "",
  initialSyncMode: "catalog",
  autoStartEngine: true,
  viewMode: "list",
  localFolders: [],
  localAutoScan: false,
  localAutoScanMinutes: 30,
  syncFrequency: {
    bilibili: "daily",
    youtube: "daily",
    xiaohongshu: "daily",
    makerworld: "daily",
    xiaoheihe: "daily"
  },
  initFullDetailLimit: 50,
  syncRandomWindowMinutes: 120,
  dailySyncCapPerPlatform: 3,
  aiTagEnabled: true,
  aiTopicEnabled: true,
  aiSummaryEnabled: true,
  aiDailyCallLimit: 50,
  deepSyncDepth: 50,
  commentBatchUpdateDays: 7,
  lastAutoSyncAt: {},
  autoSyncEnabled: false
};
async function loadSettings(plugin) {
  return Object.assign({}, DEFAULT_SETTINGS, await plugin.loadData() ?? {});
}
async function saveSettings(plugin, settings) {
  await plugin.saveData(settings);
}

// src/settings-tab.ts
var import_obsidian2 = require("obsidian");

// src/ui/folder-suggest.ts
var import_obsidian = require("obsidian");
var FolderSuggest = class extends import_obsidian.AbstractInputSuggest {
  constructor(app, inputEl) {
    super(app, inputEl);
    __publicField(this, "inputEl", inputEl);
    __publicField(this, "input");
    this.input = inputEl;
  }
  getSuggestions(query) {
    const folders = this.app.vault.getAllLoadedFiles().filter((f) => Array.isArray(f.children)).map((f) => f.path ?? "");
    const q = query.trim().toLowerCase();
    const matched = q ? folders.filter((p) => p.toLowerCase().includes(q)) : folders;
    return matched.slice(0, 30);
  }
  renderSuggestion(value, el) {
    el.setText(value);
  }
  selectSuggestion(value) {
    const input = this.input;
    input.value = value;
    input.trigger("input");
    this.close();
  }
};

// src/settings-tab.ts
var OmniSettingTab = class extends import_obsidian2.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    __publicField(this, "plugin", plugin);
  }
  display() {
    const { containerEl } = this;
    containerEl.empty();
    new import_obsidian2.Setting(containerEl).setName("AI").setHeading();
    new import_obsidian2.Setting(containerEl).setName("\u542F\u7528 AI \u6574\u7406\u5EFA\u8BAE").setDesc("\u5F00\u542F\u540E\u540C\u6B65\u5B8C\u6210\u7684\u6536\u85CF\u4F1A\u8FDB\u5165 AI \u961F\u5217\uFF08\u6279\u5904\u7406\uFF0C\u5355\u6279 \u2264100 \u6761\uFF09\u3002").addToggle(
      (toggle) => toggle.setValue(this.plugin.pluginSettings.aiEnabled).onChange(async (value) => {
        this.plugin.pluginSettings.aiEnabled = value;
        await this.plugin.saveSettings();
        await this.plugin.updateRule("ai_enabled", String(value));
      })
    );
    new import_obsidian2.Setting(containerEl).setName("AI Provider").setDesc("deepseek \u6216 openai\uFF08OpenAI \u517C\u5BB9\u63A5\u53E3\uFF09\u3002").addDropdown(
      (dd) => dd.addOption("deepseek", "DeepSeek").addOption("openai", "OpenAI").setValue(this.plugin.pluginSettings.aiProvider).onChange(async (value) => {
        this.plugin.pluginSettings.aiProvider = value;
        await this.plugin.saveSettings();
        await this.plugin.updateRule("ai_provider", value);
      })
    );
    new import_obsidian2.Setting(containerEl).setName("AI API Key").setDesc("\u53EA\u4FDD\u5B58\u5728\u672C\u5730\u6570\u636E\u76EE\u5F55\u7684\u89C4\u5219\u8868\u4E2D\uFF0C\u4E0D\u4F1A\u4E0A\u4F20\u3002").addText(
      (text) => text.setPlaceholder("sk-...").setValue(this.plugin.pluginSettings.aiApiKey).onChange(async (value) => {
        this.plugin.pluginSettings.aiApiKey = value;
        await this.plugin.saveSettings();
        await this.plugin.updateRule("ai_api_key", value);
      })
    );
    new import_obsidian2.Setting(containerEl).setName("AI \u6A21\u578B").setDesc("\u7559\u7A7A\u4F7F\u7528 Provider \u9ED8\u8BA4\u6A21\u578B\uFF08DeepSeek: deepseek-chat / OpenAI: gpt-4o-mini\uFF09\u3002").addText(
      (text) => text.setPlaceholder("deepseek-chat").setValue(this.plugin.pluginSettings.aiModel).onChange(async (value) => {
        this.plugin.pluginSettings.aiModel = value;
        await this.plugin.saveSettings();
        await this.plugin.updateRule("ai_model", value);
      })
    );
    new import_obsidian2.Setting(containerEl).setName("AI \u529F\u80FD\u5F00\u5173").setHeading();
    new import_obsidian2.Setting(containerEl).setName("AI Tag \u5EFA\u8BAE").setDesc("\u5173\u95ED\u540E AI \u4E0D\u518D\u751F\u6210 Tag \u5EFA\u8BAE\u3002").addToggle(
      (toggle) => toggle.setValue(this.plugin.pluginSettings.aiTagEnabled).onChange(async (value) => {
        this.plugin.pluginSettings.aiTagEnabled = value;
        await this.plugin.saveSettings();
        await this.plugin.updateRule("ai_tag_enabled", String(value));
      })
    );
    new import_obsidian2.Setting(containerEl).setName("AI Topic \u5EFA\u8BAE").setDesc("\u5173\u95ED\u540E AI \u4E0D\u518D\u751F\u6210 Topic \u5EFA\u8BAE\u3002").addToggle(
      (toggle) => toggle.setValue(this.plugin.pluginSettings.aiTopicEnabled).onChange(async (value) => {
        this.plugin.pluginSettings.aiTopicEnabled = value;
        await this.plugin.saveSettings();
        await this.plugin.updateRule("ai_topic_enabled", String(value));
      })
    );
    new import_obsidian2.Setting(containerEl).setName("AI \u6458\u8981\u5EFA\u8BAE").setDesc("\u5173\u95ED\u540E AI \u4E0D\u518D\u751F\u6210\u6458\u8981\u5EFA\u8BAE\u3002").addToggle(
      (toggle) => toggle.setValue(this.plugin.pluginSettings.aiSummaryEnabled).onChange(async (value) => {
        this.plugin.pluginSettings.aiSummaryEnabled = value;
        await this.plugin.saveSettings();
        await this.plugin.updateRule("ai_summary_enabled", String(value));
      })
    );
    new import_obsidian2.Setting(containerEl).setName("\u6BCF\u65E5 AI \u8C03\u7528\u4E0A\u9650").setDesc("\u9ED8\u8BA4 50 \u6B21\uFF1B\u8D85\u51FA\u540E\u6392\u961F\u6B21\u65E5\u6267\u884C\uFF08\u5199\u5165 ai_daily_call_limit\uFF09\u3002").addText(
      (text) => text.setValue(String(this.plugin.pluginSettings.aiDailyCallLimit)).onChange(async (v) => {
        const n = Math.max(1, Math.floor(Number(v) || 50));
        this.plugin.pluginSettings.aiDailyCallLimit = n;
        await this.plugin.saveSettings();
        await this.plugin.updateRule("ai_daily_call_limit", String(n));
      })
    );
    new import_obsidian2.Setting(containerEl).setName("\u540C\u6B65").setHeading();
    new import_obsidian2.Setting(containerEl).setName("\u540C\u6B65\u6A21\u5F0F").setDesc("catalog = \u8F7B\u91CF\u76EE\u5F55\uFF08\u5FEB\uFF09\uFF1Bfull = \u542B\u8BE6\u60C5/\u8BC4\u8BBA\uFF08\u6162\uFF09\u3002\u300C\u540C\u6B65\u5168\u90E8\u300D\u4F7F\u7528\u6B64\u6A21\u5F0F\u3002").addDropdown(
      (dd) => dd.addOption("catalog", "\u8F7B\u91CF\u76EE\u5F55 (catalog)").addOption("full", "\u5B8C\u6574\u8BE6\u60C5 (full)").setValue(this.plugin.pluginSettings.initialSyncMode).onChange(async (value) => {
        this.plugin.pluginSettings.initialSyncMode = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("\u540C\u6B65\u8BA1\u5212").setHeading();
    new import_obsidian2.Setting(containerEl).setName("\u542F\u7528\u81EA\u52A8\u540C\u6B65").setDesc("\u9ED8\u8BA4\u5173\u95ED\uFF1B\u5F00\u542F\u540E\u6309\u4E0B\u65B9\u9891\u7387/\u968F\u673A\u7A97\u53E3/\u65E5\u4E0A\u9650\u81EA\u52A8\u540C\u6B65\uFF08\u98CE\u63A7\u671F\u5EFA\u8BAE\u4FDD\u6301\u5173\u95ED\uFF09\u3002").addToggle(
      (toggle) => toggle.setValue(this.plugin.pluginSettings.autoSyncEnabled).onChange(async (value) => {
        this.plugin.pluginSettings.autoSyncEnabled = value;
        await this.plugin.saveSettings();
        this.plugin.reloadSyncScheduler();
      })
    );
    const platforms = [
      ["bilibili", "B\u7AD9"],
      ["youtube", "YouTube"],
      ["xiaohongshu", "\u5C0F\u7EA2\u4E66"],
      ["makerworld", "MakerWorld"],
      ["xiaoheihe", "\u5C0F\u9ED1\u76D2"]
    ];
    for (const [key, label] of platforms) {
      new import_obsidian2.Setting(containerEl).setName(`${label} \u81EA\u52A8\u540C\u6B65\u9891\u7387`).setDesc("daily = \u6BCF\u65E5\u81EA\u52A8\u540C\u6B65\uFF1Bweekly = \u6BCF\u5468\u81EA\u52A8\u540C\u6B65\u3002").addDropdown(
        (dd) => dd.addOption("daily", "\u6BCF\u65E5").addOption("weekly", "\u6BCF\u5468").setValue(this.plugin.pluginSettings.syncFrequency[key] ?? "daily").onChange(async (value) => {
          this.plugin.pluginSettings.syncFrequency = {
            ...this.plugin.pluginSettings.syncFrequency,
            [key]: value
          };
          await this.plugin.saveSettings();
          await this.plugin.updateRule(`${key}_sync_frequency`, value);
        })
      );
    }
    new import_obsidian2.Setting(containerEl).setName("\u521D\u59CB\u5316\u5B8C\u6574\u8BE6\u60C5\u6761\u6570").setDesc("\u9996\u6B21/\u624B\u52A8 full \u540C\u6B65\u6700\u591A\u62C9\u53D6\u8BE6\u60C5\u4E0E\u8BC4\u8BBA\u7684\u6761\u6570\uFF08\u533A\u95F4 20~80\uFF09\u3002").addText(
      (text) => text.setValue(String(this.plugin.pluginSettings.initFullDetailLimit)).onChange(async (v) => {
        const n = Math.max(20, Math.min(80, Math.floor(Number(v) || 50)));
        this.plugin.pluginSettings.initFullDetailLimit = n;
        await this.plugin.saveSettings();
        await this.plugin.updateRule("init_full_detail_limit", String(n));
      })
    );
    new import_obsidian2.Setting(containerEl).setName("\u968F\u673A\u6267\u884C\u7A97\u53E3\uFF08\u5206\u949F\uFF09").setDesc("\u81EA\u52A8\u540C\u6B65\u5728\u7A97\u53E3\u5185\u968F\u673A\u6267\u884C\uFF0C\u907F\u514D\u56FA\u5B9A\u65F6\u523B\u88AB\u98CE\u63A7\u3002").addText(
      (text) => text.setValue(String(this.plugin.pluginSettings.syncRandomWindowMinutes)).onChange(async (v) => {
        const n = Math.max(0, Math.floor(Number(v) || 120));
        this.plugin.pluginSettings.syncRandomWindowMinutes = n;
        await this.plugin.saveSettings();
        await this.plugin.updateRule("sync_random_window_minutes", String(n));
      })
    );
    new import_obsidian2.Setting(containerEl).setName("\u5355\u5E73\u53F0\u6BCF\u65E5\u540C\u6B65\u4E0A\u9650").setDesc("\u5F53\u5929\u8FBE\u5230\u4E0A\u9650\u540E\u4E0D\u518D\u81EA\u52A8\u89E6\u53D1\u8BE5\u5E73\u53F0\u3002").addText(
      (text) => text.setValue(String(this.plugin.pluginSettings.dailySyncCapPerPlatform)).onChange(async (v) => {
        const n = Math.max(1, Math.floor(Number(v) || 3));
        this.plugin.pluginSettings.dailySyncCapPerPlatform = n;
        await this.plugin.saveSettings();
        await this.plugin.updateRule("daily_sync_cap_per_platform", String(n));
      })
    );
    new import_obsidian2.Setting(containerEl).setName("\u6DF1\u5EA6\u5386\u53F2\u540C\u6B65\u56DE\u6EAF\u6DF1\u5EA6\uFF08\u9875\uFF09").setDesc("\u624B\u52A8\u6DF1\u5EA6\u540C\u6B65\u65F6\u5411\u540E\u62C9\u53D6\u7684\u5386\u53F2\u9875\u6570\u3002").addText(
      (text) => text.setValue(String(this.plugin.pluginSettings.deepSyncDepth)).onChange(async (v) => {
        const n = Math.max(1, Math.floor(Number(v) || 50));
        this.plugin.pluginSettings.deepSyncDepth = n;
        await this.plugin.saveSettings();
        await this.plugin.updateRule("deep_sync_default_depth", String(n));
      })
    );
    new import_obsidian2.Setting(containerEl).setName("\u8BC4\u8BBA\u6279\u91CF\u66F4\u65B0\u6700\u8FD1 N \u5929").setDesc("\u6279\u91CF\u5237\u65B0\u6700\u8FD1 N \u5929\u5185\u540C\u6B65\u6536\u85CF\u7684\u8BC4\u8BBA\u3002").addText(
      (text) => text.setValue(String(this.plugin.pluginSettings.commentBatchUpdateDays)).onChange(async (v) => {
        const n = Math.max(1, Math.floor(Number(v) || 7));
        this.plugin.pluginSettings.commentBatchUpdateDays = n;
        await this.plugin.saveSettings();
        await this.plugin.updateRule("comment_batch_update_days", String(n));
      })
    );
    new import_obsidian2.Setting(containerEl).setName("\u540C\u6B65 MakerWorld \u70B9\u8D5E\u5185\u5BB9").setDesc("\u5F00\u542F\u540E\uFF0CMakerWorld \u540C\u6B65\u9664\u4E86\u6536\u85CF\u5939\uFF0C\u8FD8\u4F1A\u91C7\u96C6\u4F60\u70B9\u8D5E\u8FC7\u7684\u6A21\u578B\uFF08\u9ED8\u8BA4\u5173\u95ED\uFF09\u3002").addToggle(
      (toggle) => toggle.setValue(this.plugin.pluginSettings.makerworldSyncLikes).onChange(async (value) => {
        this.plugin.pluginSettings.makerworldSyncLikes = value;
        await this.plugin.saveSettings();
        await this.plugin.updateRule("makerworld_sync_likes", String(value));
      })
    );
    new import_obsidian2.Setting(containerEl).setName("Engine").setHeading();
    new import_obsidian2.Setting(containerEl).setName("\u81EA\u52A8\u542F\u52A8 Engine").setDesc("\u8BF7\u6C42\u6536\u85CF/\u540C\u6B65\u65F6\u81EA\u52A8\u62C9\u8D77 Engine\uFF1B\u5173\u95ED\u540E\u9700\u624B\u52A8\u70B9\u4FA7\u8FB9\u680F\u300C\u542F\u52A8\u5F15\u64CE\u300D\u3002").addToggle(
      (toggle) => toggle.setValue(this.plugin.pluginSettings.autoStartEngine).onChange(async (value) => {
        this.plugin.pluginSettings.autoStartEngine = value;
        await this.plugin.saveSettings();
        this.plugin.updateEngineAutoStart();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("Node.js \u8DEF\u5F84").setDesc("Engine \u5B50\u8FDB\u7A0B\u4F7F\u7528\u7684 Node \u53EF\u6267\u884C\u6587\u4EF6\uFF1B\u7559\u7A7A\u5219\u4F7F\u7528 PATH \u4E2D\u7684 node\uFF08Windows \u53EF\u586B\u5B8C\u6574\u8DEF\u5F84\uFF09\u3002").addText(
      (text) => text.setValue(this.plugin.pluginSettings.nodeBin).onChange(async (value) => {
        this.plugin.pluginSettings.nodeBin = value;
        await this.plugin.saveSettings();
        this.plugin.updateEngineNodeBin();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("\u672C\u5730\u6587\u4EF6").setHeading();
    new import_obsidian2.Setting(containerEl).setName("\u5DF2\u52A0\u5165\u7684\u76EE\u5F55").setDesc("\u626B\u63CF\u8FD9\u4E9B\u76EE\u5F55\u4E2D\u7684 .md / .pdf\uFF0C\u6309\u7CFB\u7EDF\u533A URL \u81EA\u52A8\u5173\u8054\u5230\u6536\u85CF\u3002").addButton(
      (btn) => btn.setButtonText("\u7ACB\u5373\u626B\u63CF\u5168\u90E8\u76EE\u5F55").setCta().onClick(() => {
        void this.plugin.scanAllLocalFolders();
      })
    );
    const folderList = containerEl.createEl("div", { cls: "omni-folder-list" });
    const renderFolders = () => {
      folderList.empty();
      if (this.plugin.pluginSettings.localFolders.length === 0) {
        folderList.createEl("div", { text: "\uFF08\u5C1A\u672A\u52A0\u5165\u76EE\u5F55\uFF09", cls: "omni-meta-text" });
        return;
      }
      for (const folder of this.plugin.pluginSettings.localFolders) {
        const row = folderList.createEl("div", { cls: "omni-folder-row" });
        row.createEl("span", { text: folder, cls: "omni-folder-path" });
        row.createEl("button", { text: "\u79FB\u9664", cls: "omni-btn omni-btn-sm" }).addEventListener("click", async () => {
          this.plugin.pluginSettings.localFolders = this.plugin.pluginSettings.localFolders.filter((f) => f !== folder);
          await this.plugin.saveSettings();
          renderFolders();
        });
      }
    };
    renderFolders();
    let newFolder = "";
    new import_obsidian2.Setting(containerEl).setName("\u6DFB\u52A0\u76EE\u5F55").setDesc("\u53EF\u76F4\u63A5\u7C98\u8D34\u8DEF\u5F84\uFF08\u81EA\u52A8\u53BB\u6389\u5F15\u53F7\uFF09\uFF0C\u6216\u8F93\u5165\u65F6\u4ECE\u5217\u8868\u9009\u62E9\u5E93\u5185\u6587\u4EF6\u5939\u3002").addText((text) => {
      text.setPlaceholder("D:\\Obsidian\\Zukunftkai\\Omni Collector");
      text.onChange((v) => {
        newFolder = v.replace(/^["']|["']$/g, "");
      });
      new FolderSuggest(this.app, text.inputEl);
      return text;
    }).addButton(
      (btn) => btn.setButtonText("\u6DFB\u52A0").onClick(async () => {
        const folder = newFolder.replace(/^["']|["']$/g, "");
        if (!folder) {
          new import_obsidian2.Notice("\u8BF7\u8F93\u5165\u76EE\u5F55\u8DEF\u5F84");
          return;
        }
        if (!this.plugin.pluginSettings.localFolders.includes(folder)) {
          this.plugin.pluginSettings.localFolders = [...this.plugin.pluginSettings.localFolders, folder];
          await this.plugin.saveSettings();
          renderFolders();
        }
      })
    );
    new import_obsidian2.Setting(containerEl).setName("\u81EA\u52A8\u626B\u63CF").setDesc("\u5B9A\u65F6\u81EA\u52A8\u626B\u63CF\u5DF2\u52A0\u5165\u7684\u76EE\u5F55\uFF08\u626B\u63CF\u662F\u8F7B\u91CF\u7D22\u5F15\uFF0C\u4E0D\u4F1A\u4E0B\u8F7D\u5185\u5BB9\uFF09\u3002").addToggle(
      (toggle) => toggle.setValue(this.plugin.pluginSettings.localAutoScan).onChange(async (value) => {
        this.plugin.pluginSettings.localAutoScan = value;
        await this.plugin.saveSettings();
        this.plugin.reloadAutoScan();
      })
    ).addDropdown(
      (dd) => dd.addOption("15", "\u6BCF 15 \u5206\u949F").addOption("30", "\u6BCF 30 \u5206\u949F").addOption("60", "\u6BCF\u5C0F\u65F6").addOption("360", "\u6BCF 6 \u5C0F\u65F6").setValue(String(this.plugin.pluginSettings.localAutoScanMinutes)).onChange(async (v) => {
        this.plugin.pluginSettings.localAutoScanMinutes = Number(v);
        await this.plugin.saveSettings();
        this.plugin.reloadAutoScan();
      })
    );
    new import_obsidian2.Setting(containerEl).setName("\u89C4\u5219\u4E2D\u5FC3").setHeading();
    const ruleBox = containerEl.createEl("div", { cls: "omni-rule-center" });
    const loadRules = async () => {
      ruleBox.empty();
      try {
        const { rules, changes } = await this.plugin.engine.listRules();
        for (const rule of rules) {
          const row = ruleBox.createEl("div", { cls: "omni-rule-row" });
          const main = row.createEl("div", { cls: "omni-rule-main" });
          main.createEl("div", { text: rule.rule_key, cls: "omni-rule-name" });
          main.createEl("div", {
            text: `${rule.description ?? ""}${rule.impact ? ` \xB7 ${rule.impact}` : ""}`,
            cls: "omni-meta-text"
          });
          const editor = row.createEl("div", { cls: "omni-rule-editor" });
          const input = editor.createEl("input", {
            type: "text",
            attr: { value: rule.rule_value, style: "width:90px;" }
          });
          editor.createEl("button", { text: "\u4FDD\u5B58", cls: "omni-act" }).addEventListener("click", async () => {
            await this.plugin.updateRule(rule.rule_key, input.value);
            await loadRules();
          });
          editor.createEl("button", { text: "\u9ED8\u8BA4", cls: "omni-act omni-act-ghost" }).addEventListener("click", async () => {
            if (rule.default_value !== null) {
              await this.plugin.updateRule(rule.rule_key, rule.default_value);
              await loadRules();
            }
          });
        }
        if (changes.length > 0) {
          ruleBox.createEl("div", { text: "\u6700\u8FD1\u53D8\u66F4", cls: "omni-section-title" });
          for (const c of changes.slice(0, 8)) {
            ruleBox.createEl("div", {
              text: `${c.changed_at}  ${c.rule_key}: ${c.old_value ?? "\u2205"} \u2192 ${c.new_value}`,
              cls: "omni-meta-text"
            });
          }
        }
      } catch (err) {
        ruleBox.createEl("div", {
          text: `\u89C4\u5219\u4E2D\u5FC3\u52A0\u8F7D\u5931\u8D25\uFF1A${err.message}`,
          cls: "omni-empty"
        });
      }
    };
    void loadRules();
  }
};

// src/comm/socket-client.ts
var import_node_net = __toESM(require("node:net"), 1);
var import_node_child_process = require("node:child_process");
var import_node_crypto = require("node:crypto");

// ../../node_modules/.pnpm/ws@8.21.2/node_modules/ws/wrapper.mjs
var import_stream = __toESM(require_stream(), 1);
var import_extension = __toESM(require_extension(), 1);
var import_permessage_deflate = __toESM(require_permessage_deflate(), 1);
var import_receiver = __toESM(require_receiver(), 1);
var import_sender = __toESM(require_sender(), 1);
var import_subprotocol = __toESM(require_subprotocol(), 1);
var import_websocket = __toESM(require_websocket(), 1);
var import_websocket_server = __toESM(require_websocket_server(), 1);

// ../../packages/shared-core/dist/comm.js
var MESSAGE_TYPES = [
  "ENGINE_START",
  "ENGINE_STOP",
  "TASK_SYNC",
  "TASK_COMMENTS",
  "TASK_AI",
  "TASK_GROUP",
  "TASK_ORGANIZE",
  "TASK_TAG",
  "TASK_TOPIC",
  "TASK_PRIORITY",
  "TASK_INDEX",
  "TASK_FETCH",
  "TASK_CONVERT",
  "TASK_BATCH",
  "TASK_AI_MANUAL",
  "TASK_AI_MANUAL_BATCH",
  "TAG_LIST",
  "TAG_ALIAS_ADD",
  "TAG_MERGE",
  "TAG_RENAME",
  "TOPIC_LIST",
  "TOPIC_RENAME",
  "AI_REVIEW_LIST",
  "AI_REVIEW_UPDATE",
  "AI_REVIEW_UNDO",
  "STATUS_QUERY",
  "RULE_UPDATE",
  "RULE_LIST",
  "ENGINE_READY",
  "TASK_PROGRESS",
  "TASK_COMPLETE",
  "TASK_ERROR",
  "HEALTH_UPDATE",
  "ENGINE_CLOSING"
];
var REQUIRED_PAYLOAD_FIELDS = {
  ENGINE_START: ["task"],
  TASK_SYNC: ["mode"],
  TASK_COMMENTS: [],
  TASK_AI: ["collection_id"],
  TASK_GROUP: [],
  TASK_ORGANIZE: ["collection_id", "organize_status"],
  TASK_TAG: ["collection_id", "tag"],
  TASK_TOPIC: ["collection_id", "topic"],
  TASK_PRIORITY: ["collection_id", "priority"],
  TASK_INDEX: ["folder"],
  TASK_FETCH: ["url"],
  TASK_CONVERT: ["collection_id", "to"],
  TASK_BATCH: ["ids", "action"],
  TASK_AI_MANUAL: ["collection_id", "reply"],
  TASK_AI_MANUAL_BATCH: ["collection_ids", "reply"],
  TAG_ALIAS_ADD: ["tag", "alias"],
  TAG_MERGE: ["source", "target"],
  TAG_RENAME: ["tag", "next"],
  TOPIC_RENAME: ["topic_id", "name"],
  AI_REVIEW_UNDO: ["suggestion_id"],
  AI_REVIEW_UPDATE: ["suggestion_id", "status"],
  STATUS_QUERY: ["scope"],
  RULE_UPDATE: ["rule_key", "rule_value"],
  RULE_LIST: []
};
function validateOmniMessage(value) {
  if (typeof value !== "object" || value === null) {
    return { ok: false, error: "message must be an object" };
  }
  const msg = value;
  if (typeof msg.request_id !== "string" || msg.request_id.length === 0) {
    return { ok: false, error: "missing request_id" };
  }
  if (typeof msg.timestamp !== "string" || msg.timestamp.length === 0) {
    return { ok: false, error: "missing timestamp" };
  }
  if (!MESSAGE_TYPES.includes(msg.message_type)) {
    return { ok: false, error: `unknown message_type: ${String(msg.message_type)}` };
  }
  if (typeof msg.payload !== "object" || msg.payload === null) {
    return { ok: false, error: "payload must be an object" };
  }
  const payload = msg.payload;
  const required = REQUIRED_PAYLOAD_FIELDS[msg.message_type];
  if (required) {
    for (const field of required) {
      if (payload[field] === void 0) {
        return { ok: false, error: `${msg.message_type} requires payload.${field}` };
      }
    }
  }
  return { ok: true, message: msg };
}

// src/comm/socket-client.ts
var EngineClient = class {
  constructor(opts) {
    __publicField(this, "opts", opts);
    __publicField(this, "proc");
    __publicField(this, "ws");
    __publicField(this, "eventCbs", []);
    __publicField(this, "eventsAttached", false);
    __publicField(this, "requestTimeoutMs");
    __publicField(this, "wsUrl");
    __publicField(this, "started", false);
    __publicField(this, "starting");
    __publicField(this, "autoStart");
    this.requestTimeoutMs = opts.requestTimeoutMs ?? 6e5;
    this.wsUrl = opts.wsUrl;
    this.autoStart = opts.autoStart ?? true;
  }
  async startEngine(taskKind) {
    if (this.started) return;
    if (this.starting) return this.starting;
    this.starting = this.doStart(taskKind).finally(() => {
      this.starting = void 0;
    });
    return this.starting;
  }
  /** 若引擎未启动则自动拉起（请求类方法内部调用）。 */
  async ensureStarted() {
    if (this.started) return;
    await this.startEngine("query");
  }
  get connected() {
    return this.started;
  }
  /** 轻量连通性探测。 */
  async ping() {
    try {
      await this.listPlatformStatus();
      return true;
    } catch {
      return false;
    }
  }
  async doStart(taskKind) {
    const wsPort = this.opts.wsPort ?? await this.findFreePort();
    const token = new URL(this.opts.wsUrl).searchParams.get("token") ?? "";
    this.wsUrl = `ws://127.0.0.1:${wsPort}/?token=${token}`;
    this.proc = this.opts.spawnEngine?.() ?? (0, import_node_child_process.spawn)(
      this.opts.nodeBin ?? process.execPath,
      [
        this.opts.engineScript ?? "",
        "--data-dir",
        this.opts.dataDir,
        "--socket",
        this.pipeNameOf(this.opts.pipePath),
        "--ws-port",
        String(wsPort),
        "--ws-token",
        token
      ],
      { stdio: "ignore", windowsHide: true }
    );
    this.proc.once("exit", () => {
      this.started = false;
      this.eventsAttached = false;
    });
    this.eventsAttached = false;
    let connected = false;
    for (let attempt = 0; attempt < 8 && !connected; attempt += 1) {
      try {
        this.ws = new import_websocket.default(this.wsUrl);
        await new Promise((resolve, reject) => {
          const t = setTimeout(() => reject(new Error("ws connect timeout")), 3e3);
          this.ws.once("open", () => {
            clearTimeout(t);
            resolve();
          });
          this.ws.once("error", (e) => {
            clearTimeout(t);
            reject(e);
          });
        });
        connected = true;
      } catch {
        this.ws?.terminate();
        if (attempt === 7) throw new Error("ws connect failed after retries");
        await new Promise((r) => setTimeout(r, 1e3));
      }
    }
    const res = await this.requestRaw({
      request_id: (0, import_node_crypto.randomUUID)(),
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      message_type: "ENGINE_START",
      payload: { task: taskKind }
    });
    if (res.message_type !== "ENGINE_READY") {
      throw new Error(`ENGINE_START failed: ${res.message_type}`);
    }
    this.started = true;
    this.attachEvents();
  }
  findFreePort() {
    return new Promise((resolve, reject) => {
      const srv = import_node_net.default.createServer();
      srv.once("error", reject);
      srv.listen(0, "127.0.0.1", () => {
        const address = srv.address();
        srv.close(() => resolve(address.port));
      });
    });
  }
  request(msg) {
    if (!this.started && msg.message_type !== "ENGINE_START" && this.autoStart) {
      return this.ensureStarted().then(() => this.requestRaw(msg));
    }
    return this.requestRaw(msg);
  }
  requestRaw(msg) {
    const full = { ...msg, timestamp: msg.timestamp ?? (/* @__PURE__ */ new Date()).toISOString() };
    return new Promise((resolve, reject) => {
      const socket = import_node_net.default.createConnection(this.opts.pipePath);
      let buffer = "";
      const timer = setTimeout(() => {
        socket.destroy();
        reject(new Error("request timeout"));
      }, this.requestTimeoutMs);
      socket.setEncoding("utf8");
      socket.on("connect", () => socket.write(`${JSON.stringify(full)}
`));
      socket.on("data", (chunk) => {
        buffer += chunk;
        const idx = buffer.indexOf("\n");
        if (idx < 0) return;
        const line = buffer.slice(0, idx);
        socket.destroy();
        clearTimeout(timer);
        const result = validateOmniMessage(JSON.parse(line));
        if (!result.ok) {
          reject(new Error(`COMM_001: ${result.error}`));
          return;
        }
        resolve(result.message);
      });
      socket.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });
  }
  onEvent(cb) {
    this.eventCbs.push(cb);
    this.attachEvents();
  }
  attachEvents() {
    if (this.eventsAttached || !this.ws) return;
    this.eventsAttached = true;
    this.ws.on("message", (data) => {
      try {
        const msg = JSON.parse(data.toString());
        for (const cb of this.eventCbs) cb(msg);
      } catch {
      }
    });
  }
  async stopEngine(reason = "plugin") {
    try {
      await this.request({
        request_id: (0, import_node_crypto.randomUUID)(),
        timestamp: (/* @__PURE__ */ new Date()).toISOString(),
        message_type: "ENGINE_STOP",
        payload: { reason }
      });
    } catch {
    }
    this.dispose();
  }
  /** 更新业务规则（如 makerworld_sync_likes 用户开关）。 */
  async updateRule(key, value) {
    return this.request({
      request_id: (0, import_node_crypto.randomUUID)(),
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      message_type: "RULE_UPDATE",
      payload: { rule_key: key, rule_value: value }
    });
  }
  /** 列出待审核 AI 建议。 */
  async listAiSuggestions() {
    const res = await this.request({
      request_id: (0, import_node_crypto.randomUUID)(),
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      message_type: "AI_REVIEW_LIST",
      payload: {}
    });
    return res.payload?.suggestions ?? [];
  }
  /** 审核建议：accepted / rejected。 */
  async reviewAiSuggestion(id, status) {
    return this.request({
      request_id: (0, import_node_crypto.randomUUID)(),
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      message_type: "AI_REVIEW_UPDATE",
      payload: { suggestion_id: id, status }
    });
  }
  /** 撤销已确认的 AI 建议（24 小时内，SPEC S9.2）。 */
  async undoAiSuggestion(id) {
    return this.request({
      request_id: (0, import_node_crypto.randomUUID)(),
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      message_type: "AI_REVIEW_UNDO",
      payload: { suggestion_id: id }
    });
  }
  /** 运行 ContentGroup 关联识别（生成 suggested_group 建议，等待用户审核）。 */
  async runAutoGroup() {
    return this.request({
      request_id: (0, import_node_crypto.randomUUID)(),
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      message_type: "TASK_GROUP",
      payload: {}
    });
  }
  /** 查询收藏列表（DTO）。 */
  async listCollections() {
    const res = await this.request({
      request_id: (0, import_node_crypto.randomUUID)(),
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      message_type: "STATUS_QUERY",
      payload: { scope: "collections" }
    });
    return res.payload?.collections ?? [];
  }
  /** 同步指定平台。 */
  async syncPlatform(platform, mode = "full", depth) {
    return this.request({
      request_id: (0, import_node_crypto.randomUUID)(),
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      message_type: "TASK_SYNC",
      payload: { platform, mode, ...typeof depth === "number" ? { depth } : {} }
    });
  }
  /** 评论批量更新（最近 N 天，PRD 12.5）。 */
  async refreshComments(platform, days) {
    return this.request({
      request_id: (0, import_node_crypto.randomUUID)(),
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      message_type: "TASK_COMMENTS",
      payload: { ...platform ? { platform } : {}, ...typeof days === "number" ? { days } : {} }
    });
  }
  /** 规则中心（PRD 15.4）。 */
  async listRules() {
    const res = await this.request({
      request_id: (0, import_node_crypto.randomUUID)(),
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      message_type: "RULE_LIST",
      payload: {}
    });
    return {
      rules: res.payload?.rules ?? [],
      changes: res.payload?.changes ?? []
    };
  }
  /** 更新收藏整理状态。 */
  async setOrganizeState(collectionId, organizeStatus) {
    return this.request({
      request_id: (0, import_node_crypto.randomUUID)(),
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      message_type: "TASK_ORGANIZE",
      payload: { collection_id: collectionId, organize_status: organizeStatus }
    });
  }
  /** 查询各平台收藏数与上次同步时间。 */
  async listPlatformStatus() {
    const res = await this.request({
      request_id: (0, import_node_crypto.randomUUID)(),
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      message_type: "STATUS_QUERY",
      payload: { scope: "platforms" }
    });
    return res.payload?.platforms ?? [];
  }
  /** 查询单条收藏详情（含评论）。 */
  async getCollection(collectionId) {
    const res = await this.request({
      request_id: (0, import_node_crypto.randomUUID)(),
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      message_type: "STATUS_QUERY",
      payload: { scope: "collection", id: collectionId }
    });
    return res.payload?.collection ?? null;
  }
  /** 用户手动给收藏打 Tag。 */
  async addTag(collectionId, tag) {
    return this.request({
      request_id: (0, import_node_crypto.randomUUID)(),
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      message_type: "TASK_TAG",
      payload: { collection_id: collectionId, tag }
    });
  }
  /** Tag Atlas 列表（PRD 16.2）。 */
  async listTags() {
    const res = await this.request({
      request_id: (0, import_node_crypto.randomUUID)(),
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      message_type: "TAG_LIST",
      payload: {}
    });
    return res.payload?.tags ?? [];
  }
  /** 为 Tag 添加别名。 */
  async addTagAlias(tag, alias) {
    return this.request({
      request_id: (0, import_node_crypto.randomUUID)(),
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      message_type: "TAG_ALIAS_ADD",
      payload: { tag, alias }
    });
  }
  /** 合并 Tag（source 并入 target）。 */
  async mergeTags(source, target) {
    return this.request({
      request_id: (0, import_node_crypto.randomUUID)(),
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      message_type: "TAG_MERGE",
      payload: { source, target }
    });
  }
  /** 重命名 Tag（重名自动合并）。 */
  async renameTag(tag, next) {
    return this.request({
      request_id: (0, import_node_crypto.randomUUID)(),
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      message_type: "TAG_RENAME",
      payload: { tag, next }
    });
  }
  /** Topic 列表（PRD 17）。 */
  async listTopics() {
    const res = await this.request({
      request_id: (0, import_node_crypto.randomUUID)(),
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      message_type: "TOPIC_LIST",
      payload: {}
    });
    return res.payload?.topics ?? [];
  }
  /** 重命名 Topic。 */
  async renameTopic(topicId, name) {
    return this.request({
      request_id: (0, import_node_crypto.randomUUID)(),
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      message_type: "TOPIC_RENAME",
      payload: { topic_id: topicId, name }
    });
  }
  /** 用户手动把收藏归入 Topic。 */
  async addTopic(collectionId, topic) {
    return this.request({
      request_id: (0, import_node_crypto.randomUUID)(),
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      message_type: "TASK_TOPIC",
      payload: { collection_id: collectionId, topic }
    });
  }
  /** 用户手动设置收藏优先级。 */
  async setPriority(collectionId, priority) {
    return this.request({
      request_id: (0, import_node_crypto.randomUUID)(),
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      message_type: "TASK_PRIORITY",
      payload: { collection_id: collectionId, priority }
    });
  }
  /** 扫描本地文件夹（Markdown/PDF）并关联收藏。 */
  async scanFolder(folder) {
    return this.request({
      request_id: (0, import_node_crypto.randomUUID)(),
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      message_type: "TASK_INDEX",
      payload: { folder }
    });
  }
  /** 按需抓取网页正文（不落盘）。 */
  async fetchPageText(url) {
    const res = await this.request({
      request_id: (0, import_node_crypto.randomUUID)(),
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      message_type: "TASK_FETCH",
      payload: { url }
    });
    return {
      title: res.payload?.title ?? void 0,
      text: res.payload?.text ?? void 0,
      comments: res.payload?.comments ?? void 0
    };
  }
  /** 稍后再看处理：转为收藏或归档。 */
  async convertCollection(collectionId, to) {
    return this.request({
      request_id: (0, import_node_crypto.randomUUID)(),
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      message_type: "TASK_CONVERT",
      payload: { collection_id: collectionId, to }
    });
  }
  /** 查询本地文件索引。 */
  async listLocalFiles() {
    const res = await this.request({
      request_id: (0, import_node_crypto.randomUUID)(),
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      message_type: "STATUS_QUERY",
      payload: { scope: "local_files" }
    });
    return res.payload?.files ?? [];
  }
  /** 查询汇总统计。 */
  async getSummary() {
    const res = await this.request({
      request_id: (0, import_node_crypto.randomUUID)(),
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      message_type: "STATUS_QUERY",
      payload: { scope: "summary" }
    });
    return res.payload?.summary ?? {
      total: 0,
      unorganized: 0,
      important: 0,
      aiPending: 0,
      watchLater: 0,
      localFiles: 0,
      topics: 0,
      anomalies: { deleted: 0, syncFailed: 0, fileMissing: 0 }
    };
  }
  /** 批量操作。 */
  async batch(ids, action, value) {
    return this.request({
      request_id: (0, import_node_crypto.randomUUID)(),
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      message_type: "TASK_BATCH",
      payload: { ids, action, value }
    });
  }
  /** Manual 模式：提交 AI 回复解析为 Suggestion。 */
  async submitManualAI(collectionId, reply) {
    return this.request({
      request_id: (0, import_node_crypto.randomUUID)(),
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      message_type: "TASK_AI_MANUAL",
      payload: { collection_id: collectionId, reply }
    });
  }
  /** Manual 批量：一次提交多收藏的打包回复（PRD 19.3 批量版）。 */
  async submitManualAIBatch(collectionIds, reply) {
    return this.request({
      request_id: (0, import_node_crypto.randomUUID)(),
      timestamp: (/* @__PURE__ */ new Date()).toISOString(),
      message_type: "TASK_AI_MANUAL_BATCH",
      payload: { collection_ids: collectionIds, reply }
    });
  }
  watchExit(cb) {
    this.proc?.on("exit", (code) => cb(code ?? -1));
  }
  dispose() {
    this.eventsAttached = false;
    this.ws?.terminate();
    this.ws = void 0;
    if (this.proc && this.proc.exitCode === null) {
      this.proc.kill("SIGTERM");
    }
    this.proc = void 0;
  }
  pipeNameOf(pipePath) {
    return pipePath.includes("\\\\.\\pipe\\") ? pipePath.replace("\\\\.\\pipe\\", "") : pipePath;
  }
};

// src/ui/sidebar.ts
var import_obsidian3 = require("obsidian");
var VIEW_TYPE_OMNI = "omni-collector-view";
var PLATFORMS = [
  { key: "bilibili", label: "B\u7AD9" },
  { key: "youtube", label: "YouTube" },
  { key: "xiaohongshu", label: "\u5C0F\u7EA2\u4E66" },
  { key: "makerworld", label: "MakerWorld" },
  { key: "xiaoheihe", label: "\u5C0F\u9ED1\u76D2" }
];
var OmniSidebarView = class extends import_obsidian3.ItemView {
  constructor(leaf, engine, ctrl) {
    super(leaf);
    __publicField(this, "engine", engine);
    __publicField(this, "ctrl", ctrl);
    __publicField(this, "statusEl");
    __publicField(this, "dotEl");
    __publicField(this, "totalEl");
    __publicField(this, "summaryEl");
    __publicField(this, "startBtn");
    __publicField(this, "platformEls", /* @__PURE__ */ new Map());
    __publicField(this, "busy", false);
  }
  getViewType() {
    return VIEW_TYPE_OMNI;
  }
  getDisplayText() {
    return "Omni Collector";
  }
  getIcon() {
    return "sparkles";
  }
  async onOpen() {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("omni-panel");
    container.createEl("div", { text: "Omni Collector", cls: "omni-panel-title" });
    const statusRow = container.createEl("div", { cls: "omni-status-row" });
    this.dotEl = statusRow.createEl("span", { cls: "omni-dot omni-dot-unknown" });
    this.statusEl = statusRow.createEl("span", { text: "Engine: \u672A\u8FDE\u63A5", cls: "omni-status-text" });
    this.startBtn = statusRow.createEl("button", { text: "\u542F\u52A8\u5F15\u64CE", cls: "omni-btn omni-btn-sm" });
    this.startBtn.addEventListener("click", () => {
      void this.withBusy(async () => {
        await this.ctrl.startEngine();
        await this.refreshStatus();
      });
    });
    const stopBtn = statusRow.createEl("button", { text: "\u505C\u6B62\u5F15\u64CE", cls: "omni-btn omni-btn-sm omni-btn-ghost" });
    stopBtn.addEventListener("click", () => {
      void this.withBusy(async () => {
        await this.ctrl.stopEngine();
        this.setStatus(false);
      });
    });
    this.totalEl = container.createEl("div", { cls: "omni-total" });
    this.summaryEl = container.createEl("div", { cls: "omni-total omni-summary" });
    container.createEl("div", { text: "\u540C\u6B65", cls: "omni-section-title" });
    container.createEl("button", { text: "\u540C\u6B65\u5168\u90E8\u5E73\u53F0", cls: "omni-btn omni-btn-primary" }).addEventListener("click", () => {
      void this.withBusy(async () => {
        await this.ctrl.syncAll();
        await this.refreshStatus();
      });
    });
    const grid = container.createEl("div", { cls: "omni-platform-grid" });
    for (const p of PLATFORMS) {
      const row = grid.createEl("div", { cls: "omni-platform-row" });
      const open = row.createEl("button", { text: `\u67E5\u770B${p.label}`, cls: "omni-btn omni-btn-sm" });
      open.addEventListener("click", () => {
        void this.ctrl.openCollectionList(p.key);
      });
      const sync = row.createEl("button", { text: "\u540C\u6B65", cls: "omni-btn omni-btn-sm omni-btn-ghost" });
      sync.addEventListener("click", () => {
        void this.withBusy(async () => {
          await this.ctrl.syncPlatform(p.key);
          await this.refreshStatus();
        });
      });
      const deep = row.createEl("button", { text: "\u6DF1\u5EA6", cls: "omni-btn omni-btn-sm omni-btn-ghost" });
      deep.addEventListener("click", () => {
        void this.withBusy(async () => {
          await this.ctrl.deepSyncPlatform(p.key);
          await this.refreshStatus();
        });
      });
      const meta = row.createEl("span", { cls: "omni-platform-meta" });
      this.platformEls.set(p.key, meta);
    }
    container.createEl("div", { text: "\u5185\u5BB9", cls: "omni-section-title" });
    const contentRow = container.createEl("div", { cls: "omni-btn-grid" });
    this.addActionButton(contentRow, "\u6536\u85CF\u5217\u8868", () => this.ctrl.openCollectionList());
    this.addActionButton(contentRow, "\u751F\u6210 Markdown", () => this.withBusy(async () => {
      await this.ctrl.generateMarkdown();
    }));
    this.addActionButton(contentRow, "\u5206\u7EC4\u8BC6\u522B", () => this.withBusy(async () => {
      await this.ctrl.runGroupRecognition();
    }));
    this.addActionButton(contentRow, "AI \u5EFA\u8BAE\u5BA1\u6838", () => this.ctrl.openAiReview());
    this.addActionButton(contentRow, "Tag/Topic \u7BA1\u7406", () => this.ctrl.openTagTopic());
    this.addActionButton(contentRow, "Manual AI \u6A21\u677F", () => this.ctrl.openManualAI());
    this.addActionButton(contentRow, "Manual AI \u6279\u91CF", () => this.ctrl.openManualAIBatch());
    this.addActionButton(contentRow, "\u8BC4\u8BBA\u6279\u91CF\u66F4\u65B0", () => this.withBusy(async () => {
      await this.ctrl.refreshComments();
      await this.refreshStatus();
    }));
    this.addActionButton(contentRow, "\u626B\u63CF\u672C\u5730\u6587\u4EF6", () => this.withBusy(async () => {
      await this.ctrl.scanLocalFiles();
    }));
    container.createEl("button", { text: "\u6253\u5F00\u8BBE\u7F6E", cls: "omni-btn" }).addEventListener("click", () => {
      void this.ctrl.openSettings();
    });
    await this.refreshStatus();
  }
  async onClose() {
  }
  addActionButton(parent, label, cb) {
    parent.createEl("button", { text: label, cls: "omni-btn" }).addEventListener("click", cb);
  }
  async refreshStatus() {
    const ok = await this.engine.ping().catch(() => false);
    this.setStatus(ok);
    if (ok) {
      try {
        const platforms = await this.engine.listPlatformStatus();
        let total = 0;
        for (const p of platforms) {
          total += p.count;
          const el = this.platformEls.get(p.platform);
          if (el) {
            el.empty();
            const dot = el.createEl("span", {
              cls: `omni-dot omni-dot-${p.health?.level ?? "unknown"}`,
              attr: { title: p.health?.reason ?? "" }
            });
            el.createEl("span", {
              text: `${p.count} \u6761 \xB7 ${p.lastSyncAt ? new Date(p.lastSyncAt).toLocaleDateString("zh-CN") : "\u672A\u540C\u6B65"}${p.health?.reason ? ` \xB7 ${p.health.reason}` : ""}`
            });
            void dot;
          }
        }
        this.totalEl.setText(`\u5DF2\u540C\u6B65 ${total} \u6761\u6536\u85CF`);
        const summary = await this.engine.getSummary().catch(() => null);
        if (summary) {
          const a = summary.anomalies;
          this.summaryEl.setText(`\u672A\u6574\u7406 ${summary.unorganized} \xB7 \u91CD\u8981/\u9879\u76EE ${summary.important} \xB7 \u7A0D\u540E\u518D\u770B ${summary.watchLater} \xB7 \u5F85\u5BA1 AI ${summary.aiPending} \xB7 Topic ${summary.topics} \xB7 \u672C\u5730 ${summary.localFiles} \xB7 \u5F02\u5E38 ${a.deleted + a.syncFailed + a.fileMissing}`);
        }
      } catch {
      }
    }
  }
  setStatus(ok) {
    const state = ok ? "ready" : "unknown";
    this.dotEl.removeClass("omni-dot-unknown", "omni-dot-ready", "omni-dot-closing", "omni-dot-error");
    this.dotEl.addClass(`omni-dot-${state}`);
    this.statusEl.setText(ok ? "Engine: \u5DF2\u8FDE\u63A5" : "Engine: \u672A\u8FDE\u63A5");
    this.startBtn.setText(ok ? "\u91CD\u542F\u5F15\u64CE" : "\u542F\u52A8\u5F15\u64CE");
  }
  async withBusy(fn) {
    if (this.busy) return;
    this.busy = true;
    this.statusEl.setText("\u5904\u7406\u4E2D\u2026");
    try {
      await fn();
    } catch (err) {
      new import_obsidian3.Notice(`Omni Collector: ${err.message}`);
      this.setStatus(false);
    } finally {
      this.busy = false;
      if (!this.dotEl.hasClass("omni-dot-ready")) await this.refreshStatus();
    }
  }
};

// src/ui/ai-review.ts
var import_obsidian4 = require("obsidian");
var VIEW_TYPE_OMNI_AI = "omni-collector-ai-review";
var TYPE_LABELS = {
  suggested_tag: "\u6807\u7B7E\u5EFA\u8BAE",
  suggested_topic: "Topic \u5EFA\u8BAE",
  suggested_summary: "\u6458\u8981\u5EFA\u8BAE",
  suggested_group: "\u5206\u7EC4\u5EFA\u8BAE",
  suggested_relation: "\u5173\u8054\u5EFA\u8BAE"
};
function parseTagList(payload) {
  const trimmed = (payload ?? "").trim();
  if (!trimmed) return [];
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed.map(String);
    if (typeof parsed === "string") return [parsed];
    if (parsed && Array.isArray(parsed.tags)) {
      return parsed.tags.map(String);
    }
  } catch {
  }
  return trimmed.split(",").map((s) => s.trim()).filter(Boolean);
}
function renderPayload(container, suggestion) {
  const payload = suggestion.payload ?? "";
  if (suggestion.suggestion_type === "suggested_tag") {
    const chips = container.createEl("div", { cls: "omni-chip-row" });
    for (const tag of parseTagList(payload)) {
      chips.createEl("span", { text: `#${tag}`, cls: "omni-badge omni-badge-tag" });
    }
    return;
  }
  if (suggestion.suggestion_type === "suggested_group") {
    try {
      const data = JSON.parse(payload);
      container.createEl("span", {
        text: `\u5206\u7EC4\u300C${data.name ?? "\u672A\u547D\u540D"}\u300D \xB7 ${data.collection_ids?.length ?? 0} \u6761`,
        cls: "omni-badge omni-badge-group"
      });
      return;
    } catch {
    }
  }
  container.createEl("span", { text: payload, cls: "omni-ai-text" });
}
var OmniAiReviewView = class extends import_obsidian4.ItemView {
  constructor(leaf, source) {
    super(leaf);
    __publicField(this, "source", source);
    __publicField(this, "accepted", /* @__PURE__ */ new Map());
  }
  getViewType() {
    return VIEW_TYPE_OMNI_AI;
  }
  getDisplayText() {
    return "AI \u5EFA\u8BAE\u5BA1\u6838";
  }
  async onOpen() {
    const container = this.containerEl.children[1];
    container.empty();
    const header = container.createEl("div", { cls: "omni-toolbar" });
    if (this.source.openManualAI) {
      header.createEl("button", { text: "Manual AI \u6A21\u677F", cls: "omni-btn omni-btn-sm" }).addEventListener("click", () => this.source.openManualAI?.());
    }
    if (this.source.openManualAIBatch) {
      header.createEl("button", { text: "Manual AI \u6279\u91CF", cls: "omni-btn omni-btn-sm" }).addEventListener("click", () => this.source.openManualAIBatch?.());
    }
    const list = container.createEl("div", { cls: "omni-ai-list" });
    container.createEl("div", {
      text: "\u786E\u8BA4\u540E\u5EFA\u8BAE\u624D\u4F1A\u5199\u5165 Tag / Topic / \u5206\u7EC4\uFF1B\u5DF2\u786E\u8BA4\u9879 24 \u5C0F\u65F6\u5185\u53EF\u64A4\u9500\u3002",
      cls: "omni-hint"
    });
    const render = async () => {
      list.empty();
      const items = await this.source.listPending().catch((e) => {
        new import_obsidian4.Notice(`\u52A0\u8F7D\u5EFA\u8BAE\u5931\u8D25\uFF1A${e.message}`);
        return [];
      });
      for (const s of items) {
        this.renderRow(list, s, false);
      }
      for (const s of this.accepted.values()) {
        this.renderRow(list, s, true);
      }
      if (items.length === 0 && this.accepted.size === 0) {
        list.createEl("div", { text: "\u6682\u65E0\u5F85\u5BA1\u6838\u7684 AI \u5EFA\u8BAE", cls: "omni-empty" });
      }
    };
    await render();
  }
  renderRow(list, s, isAccepted) {
    const row = list.createEl("div", { cls: "omni-ai-row" });
    const main = row.createEl("div", { cls: "omni-ai-main" });
    const head = main.createEl("div", { cls: "omni-ai-head" });
    head.createEl("span", {
      text: TYPE_LABELS[s.suggestion_type] ?? s.suggestion_type,
      cls: "omni-badge omni-badge-platform"
    });
    head.createEl("span", {
      text: s.collection_title || s.collection_id,
      cls: "omni-ai-title"
    });
    if (isAccepted) {
      head.createEl("span", { text: "\u5DF2\u786E\u8BA4\uFF08\u53EF\u64A4\u9500\uFF09", cls: "omni-badge omni-badge-topic" });
    }
    renderPayload(main, s);
    const actions = row.createEl("div", { cls: "omni-row-actions" });
    if (!isAccepted) {
      actions.createEl("button", { text: "\u786E\u8BA4", cls: "omni-act" }).addEventListener("click", () => {
        void this.source.review(s.id, "accepted").then(() => {
          this.accepted.set(s.id, s);
          void this.reRender();
        }).catch((e) => new import_obsidian4.Notice(`\u786E\u8BA4\u5931\u8D25\uFF1A${e.message}`));
      });
      actions.createEl("button", { text: "\u62D2\u7EDD", cls: "omni-act omni-act-ghost" }).addEventListener("click", () => {
        void this.source.review(s.id, "rejected").then(() => this.reRender()).catch((e) => new import_obsidian4.Notice(`\u62D2\u7EDD\u5931\u8D25\uFF1A${e.message}`));
      });
    } else {
      actions.createEl("button", { text: "\u64A4\u9500", cls: "omni-act" }).addEventListener("click", () => {
        void this.source.undo(s.id).then(() => {
          this.accepted.delete(s.id);
          void this.reRender();
        }).catch((e) => new import_obsidian4.Notice(`\u64A4\u9500\u5931\u8D25\uFF1A${e.message}`));
      });
    }
  }
  async reRender() {
    const container = this.containerEl.children[1];
    container.empty();
    const header = container.createEl("div", { cls: "omni-toolbar" });
    if (this.source.openManualAI) {
      header.createEl("button", { text: "Manual AI \u6A21\u677F", cls: "omni-btn omni-btn-sm" }).addEventListener("click", () => this.source.openManualAI?.());
    }
    if (this.source.openManualAIBatch) {
      header.createEl("button", { text: "Manual AI \u6279\u91CF", cls: "omni-btn omni-btn-sm" }).addEventListener("click", () => this.source.openManualAIBatch?.());
    }
    const list = container.createEl("div", { cls: "omni-ai-list" });
    container.createEl("div", {
      text: "\u786E\u8BA4\u540E\u5EFA\u8BAE\u624D\u4F1A\u5199\u5165 Tag / Topic / \u5206\u7EC4\uFF1B\u5DF2\u786E\u8BA4\u9879 24 \u5C0F\u65F6\u5185\u53EF\u64A4\u9500\u3002",
      cls: "omni-hint"
    });
    const items = await this.source.listPending().catch(() => []);
    for (const s of items) this.renderRow(list, s, false);
    for (const s of this.accepted.values()) this.renderRow(list, s, true);
    if (items.length === 0 && this.accepted.size === 0) {
      list.createEl("div", { text: "\u6682\u65E0\u5F85\u5BA1\u6838\u7684 AI \u5EFA\u8BAE", cls: "omni-empty" });
    }
  }
  async onClose() {
    this.accepted.clear();
  }
};

// src/ui/tag-topic.ts
var import_obsidian5 = require("obsidian");
var VIEW_TYPE_OMNI_TAGS = "omni-collector-tags";
function normTag(s) {
  return s.toLowerCase().replace(/[\s\u3000_\-—–.,，。:：;；'"“”‘’()（）]/g, "");
}
function levenshtein(a, b) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [
    i,
    ...Array(b.length).fill(0)
  ]);
  for (let j = 0; j <= b.length; j += 1) dp[0][j] = j;
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
  }
  return dp[a.length][b.length];
}
function findDuplicates(tags, limit = 30) {
  const keys = tags.map((t) => ({ raw: t.name, key: normTag(t.name) }));
  const out = [];
  for (let i = 0; i < keys.length; i += 1) {
    for (let j = i + 1; j < keys.length; j += 1) {
      const a = keys[i];
      const b = keys[j];
      if (!a.key || !b.key || a.key === b.key) continue;
      const shorter = a.key.length <= b.key.length ? a : b;
      const longer = shorter === a ? b : a;
      let score = 0;
      if (shorter.key.length >= 2 && (longer.key.startsWith(shorter.key) || longer.key.includes(shorter.key))) {
        const diff = longer.key.length - shorter.key.length;
        if (diff <= 3) score = shorter.key.length / longer.key.length;
      }
      if (score < 0.8) {
        const maxLen = Math.max(a.key.length, b.key.length);
        const sim = maxLen === 0 ? 0 : 1 - levenshtein(a.key, b.key) / maxLen;
        if (sim >= 0.8) score = sim;
      }
      if (score > 0) out.push({ a: a.raw, b: b.raw, score });
    }
  }
  out.sort((x, y) => y.score - x.score);
  return out.slice(0, limit);
}
var OmniTagTopicView = class extends import_obsidian5.ItemView {
  constructor(leaf, source) {
    super(leaf);
    __publicField(this, "source", source);
    __publicField(this, "tab", "tags");
  }
  getViewType() {
    return VIEW_TYPE_OMNI_TAGS;
  }
  getDisplayText() {
    return "Tag / Topic \u7BA1\u7406";
  }
  getIcon() {
    return "tag";
  }
  async onOpen() {
    await this.render();
  }
  async onClose() {
  }
  async render() {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("omni-tag-topic");
    const tabs = container.createEl("div", { cls: "omni-tabs" });
    this.tabButton(tabs, "tags", "Tag Atlas", () => {
      this.tab = "tags";
      void this.render();
    });
    this.tabButton(tabs, "topics", "Topic", () => {
      this.tab = "topics";
      void this.render();
    });
    container.createEl("div", {
      text: this.tab === "tags" ? "Tag \u89C4\u8303\u5316\u540D\u79F0\u7EDF\u4E00\u5C55\u793A\uFF1B\u522B\u540D\u53EF\u7D22\u5F15\u5230\u4E3B Tag\uFF1B\u7591\u4F3C\u91CD\u590D\u5EFA\u8BAE\u4EBA\u5DE5\u5408\u5E76\uFF08PRD 16.2\uFF09\u3002" : "Topic \u805A\u5408\u6D4F\u89C8\uFF1B\u6536\u85CF\u7B14\u8BB0\u4E0E Topic \u805A\u5408\u9875\u901A\u8FC7 [[wikilink]] \u63A5\u5165\u5B98\u65B9\u5173\u7CFB\u56FE\u8C31\uFF08PRD 17\uFF09\u3002",
      cls: "omni-hint"
    });
    if (this.tab === "tags") {
      await this.renderTags(container);
    } else {
      await this.renderTopics(container);
    }
  }
  tabButton(parent, key, label, cb) {
    const btn = parent.createEl("button", {
      text: label,
      cls: `omni-chip${this.tab === key ? " omni-chip-active" : ""}`
    });
    btn.addEventListener("click", cb);
  }
  async renderTags(container) {
    const [tags, collections] = await Promise.all([
      this.source.listTags().catch(() => []),
      this.source.listCollections().catch(() => [])
    ]);
    const total = collections.reduce((acc, c) => acc + (c.tags?.length ?? 0), 0);
    container.createEl("div", {
      text: `\u5171 ${tags.length} \u4E2A Tag \xB7 ${total} \u6761\u7ED1\u5B9A`,
      cls: "omni-total"
    });
    const duplicates = findDuplicates(tags);
    if (duplicates.length > 0) {
      const box = container.createEl("div", { cls: "omni-dupe-box" });
      box.createEl("div", { text: "\u7591\u4F3C\u91CD\u590D\uFF08\u70B9\u51FB\u4E00\u952E\u5408\u5E76\uFF09", cls: "omni-section-title" });
      for (const d of duplicates) {
        const row = box.createEl("div", { cls: "omni-dupe-row" });
        row.createEl("span", { text: `${d.a}  \u2192  ${d.b}`, cls: "omni-dupe-name" });
        row.createEl("button", { text: "\u5408\u5E76", cls: "omni-act omni-act-ghost" }).addEventListener("click", () => {
          void this.runWithNotice(
            () => this.source.mergeTags(d.a, d.b).then(() => this.source.refreshMarkdown()),
            "\u5DF2\u5408\u5E76"
          ).then(() => this.render());
        });
      }
    }
    const list = container.createEl("div", { cls: "omni-list" });
    for (const t of tags) {
      const row = list.createEl("div", { cls: "omni-row" });
      const main = row.createEl("div", { cls: "omni-row-main" });
      main.createEl("div", { text: `#${t.name}`, cls: "omni-title omni-title-tag" });
      main.createEl("div", {
        text: `${t.count} \u6761` + (t.aliases.length > 0 ? ` \xB7 \u522B\u540D\uFF1A${t.aliases.join(" / ")}` : ""),
        cls: "omni-row-meta omni-meta-text"
      });
      const actions = row.createEl("div", { cls: "omni-row-actions" });
      this.action(actions, "\u522B\u540D", () => this.prompt("\u6DFB\u52A0\u522B\u540D", "\u8F93\u5165\u522B\u540D\uFF08\u5982 Frontend\uFF09", (v) => this.source.addAlias(t.name, v)));
      this.action(actions, "\u91CD\u547D\u540D", () => this.prompt("\u91CD\u547D\u540D Tag", "\u65B0\u540D\u79F0", (v) => this.source.renameTag(t.name, v).then(() => this.source.refreshMarkdown())));
      this.action(actions, "\u5408\u5E76\u5230\u2026", () => this.prompt("\u5408\u5E76\u5230", "\u76EE\u6807 Tag \u540D\u79F0", (v) => this.source.mergeTags(t.name, v).then(() => this.source.refreshMarkdown())));
    }
    if (tags.length === 0) {
      list.createEl("div", { text: "\u6682\u65E0 Tag\u3002\u540C\u6B65\u65F6\u4F1A\u81EA\u52A8\u63D0\u53D6\u5E73\u53F0\u8BDD\u9898\uFF1BAI \u5EFA\u8BAE\u786E\u8BA4\u540E\u4E5F\u4F1A\u5199\u5165\u3002", cls: "omni-empty" });
    }
  }
  async renderTopics(container) {
    const [topics, collections] = await Promise.all([
      this.source.listTopics().catch(() => []),
      this.source.listCollections().catch(() => [])
    ]);
    container.createEl("div", { text: `\u5171 ${topics.length} \u4E2A Topic`, cls: "omni-total" });
    const list = container.createEl("div", { cls: "omni-list" });
    for (const t of topics) {
      const row = list.createEl("div", { cls: "omni-row" });
      const main = row.createEl("div", { cls: "omni-row-main" });
      const head = main.createEl("div", { cls: "omni-row-meta" });
      head.createEl("span", { text: `\u25CE${t.name}`, cls: "omni-badge omni-badge-topic" });
      head.createEl("span", { text: `${t.count} \u6761 \xB7 ${t.status}`, cls: "omni-meta-text" });
      const members = collections.filter((c) => (c.topics ?? []).includes(t.name));
      for (const m of members.slice(0, 8)) {
        const mrow = main.createEl("div", { cls: "omni-topic-member" });
        mrow.setText(m.title || m.id);
        mrow.addEventListener("click", () => void this.source.openDetail(m.id));
      }
      if (members.length > 8) {
        main.createEl("div", { text: `\u2026\u7B49 ${members.length} \u6761`, cls: "omni-meta-text" });
      }
      const actions = row.createEl("div", { cls: "omni-row-actions" });
      this.action(actions, "\u91CD\u547D\u540D", () => this.prompt("\u91CD\u547D\u540D Topic", "\u65B0\u540D\u79F0", (v) => this.source.renameTopic(t.id, v).then(() => this.source.refreshMarkdown())));
    }
    if (topics.length === 0) {
      list.createEl("div", { text: "\u6682\u65E0 Topic\u3002AI \u5EFA\u8BAE\u786E\u8BA4\u540E\u4F1A\u81EA\u52A8\u521B\u5EFA\uFF1B\u4E5F\u53EF\u5728\u6536\u85CF\u8BE6\u60C5\u624B\u52A8\u5F52\u5165 Topic\u3002", cls: "omni-empty" });
    }
  }
  action(parent, label, cb) {
    parent.createEl("button", { text: label, cls: "omni-act" }).addEventListener("click", cb);
  }
  prompt(title, placeholder, submit) {
    const modal = new import_obsidian5.Modal(this.app);
    modal.titleEl.setText(title);
    const input = modal.contentEl.createEl("input", { type: "text", placeholder });
    const done = () => {
      if (!input.value.trim()) return;
      void submit(input.value.trim()).then(() => {
        modal.close();
        new import_obsidian5.Notice("\u5DF2\u4FDD\u5B58");
      }).catch((e) => new import_obsidian5.Notice(`\u4FDD\u5B58\u5931\u8D25\uFF1A${e.message}`));
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") done();
    });
    modal.contentEl.createEl("button", { text: "\u786E\u5B9A", cls: "omni-btn omni-btn-primary" }).addEventListener("click", done);
    modal.open();
  }
  async runWithNotice(fn, okText) {
    try {
      await fn();
      new import_obsidian5.Notice(okText);
    } catch (e) {
      new import_obsidian5.Notice(`\u64CD\u4F5C\u5931\u8D25\uFF1A${e.message}`);
    }
  }
};

// src/ui/collection-list.ts
var import_obsidian6 = require("obsidian");

// src/ui/helpers.ts
function filterCollections(items, filter) {
  return items.filter((c) => filter.status ? c.organizeStatus === filter.status : true).filter((c) => filter.priority ? c.priority === filter.priority : true).sort((a, b) => b.collectedAt.localeCompare(a.collectedAt));
}
function nextOrganizeState(state) {
  switch (state) {
    case "unorganized":
      return "viewed";
    case "viewed":
      return "organized";
    case "organized":
      return "archived";
    default:
      return "archived";
  }
}

// src/ui/collection-list.ts
var VIEW_TYPE_OMNI_LIST = "omni-collector-list";
var PLATFORMS2 = [
  { key: "bilibili", label: "B\u7AD9" },
  { key: "youtube", label: "YouTube" },
  { key: "xiaohongshu", label: "\u5C0F\u7EA2\u4E66" },
  { key: "makerworld", label: "MakerWorld" },
  { key: "xiaoheihe", label: "\u5C0F\u9ED1\u76D2" }
];
var PRIORITIES = [
  { key: "normal", label: "\u666E\u901A" },
  { key: "important", label: "\u91CD\u8981" },
  { key: "project", label: "\u9879\u76EE" },
  { key: "knowledge", label: "\u77E5\u8BC6" }
];
function organizeLabel(state) {
  switch (state) {
    case "unorganized":
      return "\u6807\u8BB0\u6574\u7406";
    case "viewed":
      return "\u6807\u8BB0\u5DF2\u6574\u7406";
    case "organized":
      return "\u6807\u8BB0\u5F52\u6863";
    case "archived":
      return "\u5DF2\u5F52\u6863 \u2713";
  }
}
var PromptModal = class extends import_obsidian6.Modal {
  constructor(app, title, placeholder, onSubmit) {
    super(app);
    __publicField(this, "title", title);
    __publicField(this, "placeholder", placeholder);
    __publicField(this, "onSubmit", onSubmit);
  }
  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h3", { text: this.title });
    let input = "";
    new import_obsidian6.Setting(contentEl).addText(
      (text) => text.setPlaceholder(this.placeholder).onChange((v) => {
        input = v;
      })
    ).addButton(
      (btn) => btn.setButtonText("\u786E\u5B9A").setCta().onClick(() => {
        if (input.trim()) this.onSubmit(input.trim());
        this.close();
      })
    );
  }
  onClose() {
    this.contentEl.empty();
  }
};
var OmniCollectionListView = class extends import_obsidian6.ItemView {
  constructor(leaf, source) {
    super(leaf);
    __publicField(this, "source", source);
    __publicField(this, "items", []);
    __publicField(this, "localFiles", []);
    __publicField(this, "statusFilter", "all");
    __publicField(this, "saveTypeFilter", "all");
    __publicField(this, "priorityFilter", "all");
    __publicField(this, "platformFilter", null);
    __publicField(this, "mode", "collections");
    __publicField(this, "viewMode", "list");
    __publicField(this, "coverCache", /* @__PURE__ */ new Map());
    __publicField(this, "selecting", false);
    __publicField(this, "selected", /* @__PURE__ */ new Set());
    __publicField(this, "listEl");
    __publicField(this, "toolbarEl");
    __publicField(this, "batchBarEl");
    __publicField(this, "totalEl");
  }
  getViewType() {
    return VIEW_TYPE_OMNI_LIST;
  }
  getDisplayText() {
    return "Omni Collector \u6536\u85CF";
  }
  getState() {
    return { platform: this.platformFilter };
  }
  async setState(state) {
    this.platformFilter = state.platform ?? null;
    if (this.toolbarEl) await this.renderList();
  }
  async onOpen() {
    const initial = this.getState().platform ?? null;
    this.platformFilter = initial;
    this.viewMode = this.source.getDefaultViewMode();
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("omni-list-view");
    container.createEl("div", { text: "Omni Collector \u6536\u85CF", cls: "omni-panel-title" });
    this.totalEl = container.createEl("div", { cls: "omni-total" });
    this.toolbarEl = container.createEl("div", { cls: "omni-toolbar" });
    this.batchBarEl = container.createEl("div", { cls: "omni-batch-bar" });
    this.batchBarEl.addClass("is-hidden");
    this.listEl = container.createEl("div", { cls: "omni-list" });
    await this.refreshList();
  }
  renderToolbar() {
    const tb = this.toolbarEl;
    tb.empty();
    tb.createEl("button", { text: this.mode === "collections" ? "\u6536\u85CF" : "\u6536\u85CF", cls: `omni-chip${this.mode === "collections" ? " omni-chip-active" : ""}` }).addEventListener("click", () => {
      this.mode = "collections";
      this.renderToolbar();
      void this.renderList();
    });
    tb.createEl("button", { text: "\u672C\u5730\u6587\u4EF6", cls: `omni-chip${this.mode === "local" ? " omni-chip-active" : ""}` }).addEventListener("click", () => {
      this.mode = "local";
      this.renderToolbar();
      void this.renderList();
    });
    if (this.mode === "collections") {
      tb.createEl("span", { text: "\uFF5C", cls: "omni-toolbar-sep" });
      tb.createEl("button", { text: "\u5168\u90E8\u5E73\u53F0", cls: `omni-chip${this.platformFilter === null ? " omni-chip-active" : ""}` }).addEventListener("click", () => {
        this.platformFilter = null;
        this.renderToolbar();
        void this.renderList();
      });
      for (const p of PLATFORMS2) {
        tb.createEl("button", { text: p.label, cls: `omni-chip${this.platformFilter === p.key ? " omni-chip-active" : ""}` }).addEventListener("click", () => {
          this.platformFilter = p.key;
          this.renderToolbar();
          void this.renderList();
        });
      }
      tb.createEl("span", { text: "\uFF5C", cls: "omni-toolbar-sep" });
      const types = [
        { key: "all", label: "\u5168\u90E8\u7C7B\u578B" },
        { key: "favorited", label: "\u6536\u85CF" },
        { key: "watch_later", label: "\u7A0D\u540E\u518D\u770B" },
        { key: "liked", label: "\u70B9\u8D5E" }
      ];
      for (const t of types) {
        tb.createEl("button", { text: t.label, cls: `omni-chip${this.saveTypeFilter === t.key ? " omni-chip-active" : ""}` }).addEventListener("click", () => {
          this.saveTypeFilter = t.key;
          this.renderToolbar();
          void this.renderList();
        });
      }
      tb.createEl("span", { text: "\uFF5C", cls: "omni-toolbar-sep" });
      const statuses = [
        { key: "all", label: "\u5168\u90E8\u72B6\u6001" },
        { key: "unorganized", label: "\u672A\u6574\u7406" },
        { key: "organized", label: "\u5DF2\u6574\u7406" },
        { key: "archived", label: "\u5DF2\u5F52\u6863" }
      ];
      for (const s of statuses) {
        tb.createEl("button", { text: s.label, cls: `omni-chip${this.statusFilter === s.key ? " omni-chip-active" : ""}` }).addEventListener("click", () => {
          this.statusFilter = s.key;
          this.renderToolbar();
          void this.renderList();
        });
      }
      tb.createEl("span", { text: "\uFF5C", cls: "omni-toolbar-sep" });
      const priorities = [
        { key: "all", label: "\u5168\u90E8\u4F18\u5148\u7EA7" },
        { key: "important", label: "\u91CD\u8981" },
        { key: "project", label: "\u9879\u76EE" }
      ];
      for (const p of priorities) {
        tb.createEl("button", { text: p.label, cls: `omni-chip${this.priorityFilter === p.key ? " omni-chip-active" : ""}` }).addEventListener("click", () => {
          this.priorityFilter = p.key;
          this.renderToolbar();
          void this.renderList();
        });
      }
    }
    tb.createEl("button", { text: "\u5237\u65B0", cls: "omni-chip omni-chip-refresh" }).addEventListener("click", () => {
      void this.refreshList();
    });
    if (this.mode === "collections") {
      tb.createEl("button", { text: this.viewMode === "list" ? "\u5207\u6362\u5361\u7247\u89C6\u56FE" : "\u5207\u6362\u5217\u8868\u89C6\u56FE", cls: "omni-chip" }).addEventListener("click", () => {
        this.viewMode = this.viewMode === "list" ? "card" : "list";
        this.renderToolbar();
        void this.renderList();
      });
      if (this.mode === "collections") {
        tb.createEl("button", { text: this.selecting ? "\u5B8C\u6210\u9009\u62E9" : "\u6279\u91CF\u9009\u62E9", cls: `omni-chip${this.selecting ? " omni-chip-active" : ""}` }).addEventListener("click", () => {
          this.selecting = !this.selecting;
          this.selected.clear();
          this.renderToolbar();
          this.renderBatchBar();
          void this.renderList();
        });
      }
    }
  }
  async refreshList() {
    try {
      this.items = await this.source.list();
    } catch (err) {
      new import_obsidian6.Notice(`\u52A0\u8F7D\u6536\u85CF\u5931\u8D25\uFF1A${err.message}`);
    }
    this.renderToolbar();
    await this.renderList();
  }
  async renderList() {
    this.listEl.empty();
    if (this.mode === "local") {
      this.totalEl.setText(`\u672C\u5730\u6587\u4EF6 ${this.localFiles.length} \u4E2A`);
      if (this.localFiles.length === 0) {
        this.listEl.createEl("div", { text: "\u6682\u65E0\u672C\u5730\u6587\u4EF6\uFF08\u5230\u8BBE\u7F6E\u52A0\u5165\u76EE\u5F55\u5E76\u626B\u63CF\uFF09", cls: "omni-empty" });
        return;
      }
      for (const f of this.localFiles) {
        const row = this.listEl.createEl("div", { cls: "omni-row" });
        const main = row.createEl("div", { cls: "omni-row-main" });
        main.createEl("div", { text: f.file_name || f.file_path.split(/[\\/]/).pop() || f.file_path, cls: "omni-title" });
        const meta = main.createEl("div", { cls: "omni-row-meta" });
        meta.createEl("span", { text: f.file_type ?? "file", cls: "omni-badge omni-badge-platform" });
        meta.createEl("span", { text: f.linked_title ? `\u5173\u8054\uFF1A${f.linked_title}` : "\u672A\u5173\u8054", cls: "omni-badge" });
        meta.createEl("span", { text: f.file_path, cls: "omni-meta-text" });
        row.createEl("button", { text: "\u6253\u5F00", cls: "omni-act" }).addEventListener("click", () => this.source.openLocalFile(f.file_path));
      }
      return;
    }
    const filter = {};
    if (this.statusFilter === "unorganized") filter.status = "unorganized";
    else if (this.statusFilter === "organized") filter.status = "organized";
    else if (this.statusFilter === "archived") filter.status = "archived";
    if (this.priorityFilter !== "all") filter.priority = this.priorityFilter;
    let items = filterCollections(this.items, filter);
    if (this.platformFilter) items = items.filter((i) => i.platform === this.platformFilter);
    if (this.saveTypeFilter !== "all") items = items.filter((i) => i.saveType === this.saveTypeFilter);
    this.totalEl.setText(`\u5171 ${this.items.length} \u6761\u6536\u85CF${this.platformFilter ? `\uFF08${PLATFORMS2.find((p) => p.key === this.platformFilter)?.label ?? this.platformFilter}\uFF09` : ""}\uFF0C\u5F53\u524D\u663E\u793A ${items.length} \u6761`);
    if (items.length === 0) {
      this.listEl.createEl("div", { text: "\u6682\u65E0\u6536\u85CF\uFF08\u5230\u4FA7\u8FB9\u680F\u70B9\u300C\u540C\u6B65\u5168\u90E8\u5E73\u53F0\u300D\uFF09", cls: "omni-empty" });
      return;
    }
    if (this.viewMode === "card") {
      const grid = this.listEl.createEl("div", { cls: "omni-card-grid" });
      for (const item of items) {
        const card = grid.createEl("div", { cls: "omni-card" });
        const imgBox = card.createEl("div", { cls: "omni-card-cover-wrap" });
        if (item.coverUrl) {
          imgBox.createEl("img", { cls: "omni-card-cover", attr: { referrerpolicy: "no-referrer", loading: "lazy" } });
          void this.resolveCover(item.coverUrl).then((src) => {
            const img = imgBox.querySelector("img");
            if (img && src) img.setAttribute("src", src);
          });
        } else {
          imgBox.createEl("div", { cls: "omni-card-cover omni-card-cover-empty" });
        }
        card.createEl("div", { text: item.title || item.platformItemId, cls: "omni-card-title" });
        const meta = card.createEl("div", { cls: "omni-row-meta" });
        meta.createEl("span", { text: PLATFORMS2.find((p) => p.key === item.platform)?.label ?? item.platform, cls: "omni-badge omni-badge-platform" });
        meta.createEl("span", { text: item.saveType === "liked" ? "\u70B9\u8D5E" : item.saveType === "watch_later" ? "\u7A0D\u540E\u518D\u770B" : "\u6536\u85CF", cls: "omni-badge" });
        card.addEventListener("click", () => this.source.onOpenDetail(item.id));
      }
      return;
    }
    for (const item of items) {
      const row = this.listEl.createEl("div", { cls: "omni-row" });
      if (this.selecting) {
        const cb = row.createEl("input", { type: "checkbox", cls: "omni-check" });
        cb.checked = this.selected.has(item.id);
        cb.addEventListener("change", () => {
          if (cb.checked) this.selected.add(item.id);
          else this.selected.delete(item.id);
          this.renderBatchBar();
        });
      }
      const main = row.createEl("div", { cls: "omni-row-main" });
      main.createEl("a", { text: item.title || item.platformItemId, href: item.url, cls: "omni-title" });
      main.addEventListener("click", () => this.source.onOpenDetail(item.id));
      const meta = main.createEl("div", { cls: "omni-row-meta" });
      meta.createEl("span", { text: PLATFORMS2.find((p) => p.key === item.platform)?.label ?? item.platform, cls: "omni-badge omni-badge-platform" });
      meta.createEl("span", { text: item.saveType === "liked" ? "\u70B9\u8D5E" : item.saveType === "watch_later" ? "\u7A0D\u540E\u518D\u770B" : "\u6536\u85CF", cls: "omni-badge" });
      if (item.contentStatus === "deleted") {
        meta.createEl("span", { text: "\u5931\u6548", cls: "omni-badge omni-badge-deleted" });
        row.addClass("omni-row-deleted");
      }
      meta.createEl("span", { text: PRIORITIES.find((p) => p.key === item.priority)?.label ?? item.priority, cls: "omni-badge omni-badge-priority" });
      if (item.groupName) meta.createEl("span", { text: `\u7EC4:${item.groupName}`, cls: "omni-badge omni-badge-group" });
      for (const t of item.tags ?? []) meta.createEl("span", { text: `#${t}`, cls: "omni-badge omni-badge-tag" });
      for (const t of item.topics ?? []) meta.createEl("span", { text: `\u25CE${t}`, cls: "omni-badge omni-badge-topic" });
      meta.createEl("span", { text: new Date(item.collectedAt).toLocaleDateString("zh-CN"), cls: "omni-meta-text" });
      const actions = row.createEl("div", { cls: "omni-row-actions" });
      if (item.saveType === "watch_later") {
        const fav = actions.createEl("button", { text: "\u8F6C\u6536\u85CF", cls: "omni-act" });
        fav.addEventListener("click", () => {
          void this.source.onConvert(item.id, "favorited").then(() => {
            item.saveType = "favorited";
            void this.renderList();
          });
        });
        const done = actions.createEl("button", { text: "\u5F52\u6863\u5B8C\u6210", cls: "omni-act" });
        done.addEventListener("click", () => {
          void this.source.onConvert(item.id, "archived").then(() => {
            item.organizeStatus = "archived";
            void this.renderList();
          });
        });
      }
      this.addRowButton(actions, "\uFF0BTag", () => this.promptTag(item));
      this.addRowButton(actions, "\uFF0BTopic", () => this.promptTopic(item));
      this.addPriorityButton(actions, item);
      this.addOrganizeButton(actions, item);
    }
  }
  async resolveCover(url) {
    const cached = this.coverCache.get(url);
    if (cached) return cached;
    const src = await this.source.ensureCover(url);
    if (src) this.coverCache.set(url, src);
    return src;
  }
  addRowButton(parent, label, cb) {
    const btn = parent.createEl("button", { text: label, cls: "omni-act" });
    btn.addEventListener("click", cb);
  }
  addPriorityButton(parent, item) {
    const btn = parent.createEl("button", { text: `\u4F18\u5148\u7EA7:${PRIORITIES.find((p) => p.key === item.priority)?.label ?? item.priority}`, cls: "omni-act omni-act-priority" });
    btn.addEventListener("click", () => {
      const next = PRIORITIES[(PRIORITIES.findIndex((p) => p.key === item.priority) + 1) % PRIORITIES.length];
      btn.addClass("omni-btn-disabled");
      void this.source.onPriority(item.id, next.key).then(() => {
        item.priority = next.key;
        void this.renderList();
      }).catch((e) => new import_obsidian6.Notice(`\u4F18\u5148\u7EA7\u66F4\u65B0\u5931\u8D25\uFF1A${e.message}`)).finally(() => btn.removeClass("omni-btn-disabled"));
    });
  }
  addOrganizeButton(parent, item) {
    const btn = parent.createEl("button", { text: organizeLabel(item.organizeStatus), cls: "omni-act" });
    btn.addEventListener("click", () => {
      btn.addClass("omni-btn-disabled");
      btn.setText("\u5904\u7406\u4E2D\u2026");
      void this.source.onOrganize(item.id, nextOrganizeState(item.organizeStatus)).then(() => {
        item.organizeStatus = nextOrganizeState(item.organizeStatus);
        void this.renderList();
      }).catch((e) => {
        btn.removeClass("omni-btn-disabled");
        btn.setText(organizeLabel(item.organizeStatus));
        new import_obsidian6.Notice(`\u66F4\u65B0\u5931\u8D25\uFF1A${e.message}`);
      });
    });
  }
  promptTag(item) {
    new PromptModal(this.app, `\u7ED9\u300C${item.title.slice(0, 20)}\u300D\u6253 Tag`, "\u8F93\u5165\u6807\u7B7E\u540D", (tag) => {
      void this.source.onTag(item.id, tag).then(() => {
        item.tags = [...item.tags ?? [], tag];
        void this.renderList();
      }).catch((e) => new import_obsidian6.Notice(`Tag \u6DFB\u52A0\u5931\u8D25\uFF1A${e.message}`));
    }).open();
  }
  promptTopic(item) {
    new PromptModal(this.app, `\u628A\u300C${item.title.slice(0, 20)}\u300D\u5F52\u5165 Topic`, "\u8F93\u5165 Topic \u540D", (topic) => {
      void this.source.onTopic(item.id, topic).then(() => {
        item.topics = [...item.topics ?? [], topic];
        void this.renderList();
      }).catch((e) => new import_obsidian6.Notice(`Topic \u6DFB\u52A0\u5931\u8D25\uFF1A${e.message}`));
    }).open();
  }
  currentItems() {
    const filter = {};
    if (this.statusFilter === "unorganized") filter.status = "unorganized";
    else if (this.statusFilter === "organized") filter.status = "organized";
    else if (this.statusFilter === "archived") filter.status = "archived";
    if (this.priorityFilter !== "all") filter.priority = this.priorityFilter;
    let items = filterCollections(this.items, filter);
    if (this.platformFilter) items = items.filter((i) => i.platform === this.platformFilter);
    if (this.saveTypeFilter !== "all") items = items.filter((i) => i.saveType === this.saveTypeFilter);
    return items;
  }
  renderBatchBar() {
    const bar = this.batchBarEl;
    bar.empty();
    if (!this.selecting) {
      bar.addClass("is-hidden");
      return;
    }
    bar.removeClass("is-hidden");
    bar.createEl("span", { text: `\u5DF2\u9009 ${this.selected.size} \u6761`, cls: "omni-meta-text" });
    bar.createEl("button", { text: "\u5168\u9009\u5F53\u524D", cls: "omni-btn omni-btn-sm" }).addEventListener("click", () => {
      for (const i of this.currentItems()) this.selected.add(i.id);
      this.renderBatchBar();
      void this.renderList();
    });
    bar.createEl("button", { text: "\u6E05\u9664", cls: "omni-btn omni-btn-sm" }).addEventListener("click", () => {
      this.selected.clear();
      this.renderBatchBar();
      void this.renderList();
    });
    bar.createEl("button", { text: "\u6279\u91CF Tag", cls: "omni-btn omni-btn-sm" }).addEventListener("click", () => this.promptBatch("tag"));
    bar.createEl("button", { text: "\u6279\u91CF Topic", cls: "omni-btn omni-btn-sm" }).addEventListener("click", () => this.promptBatch("topic"));
    bar.createEl("button", { text: "\u8BBE\u4E3A\u91CD\u8981", cls: "omni-btn omni-btn-sm" }).addEventListener("click", () => this.runBatch("priority", "important"));
    bar.createEl("button", { text: "\u6807\u8BB0\u5DF2\u6574\u7406", cls: "omni-btn omni-btn-sm" }).addEventListener("click", () => this.runBatch("organize", "organized"));
    bar.createEl("button", { text: "\u8F6C\u6536\u85CF", cls: "omni-btn omni-btn-sm" }).addEventListener("click", () => this.runBatch("convert", "favorited"));
    bar.createEl("button", { text: "\u5F52\u6863", cls: "omni-btn omni-btn-sm" }).addEventListener("click", () => this.runBatch("convert", "archived"));
  }
  promptBatch(action) {
    new PromptModal(this.app, action === "tag" ? "\u6279\u91CF\u6253 Tag" : "\u6279\u91CF\u5F52\u5165 Topic", action === "tag" ? "\u8F93\u5165\u6807\u7B7E\u540D" : "\u8F93\u5165 Topic \u540D", (v) => {
      void this.runBatch(action, v);
    }).open();
  }
  async runBatch(action, value) {
    const ids = [...this.selected];
    if (ids.length === 0) {
      new import_obsidian6.Notice("\u8BF7\u5148\u52FE\u9009\u6536\u85CF");
      return;
    }
    try {
      await this.source.onBatch(ids, action, value);
      new import_obsidian6.Notice(`\u5DF2\u6279\u91CF\u5904\u7406 ${ids.length} \u6761`);
      this.selected.clear();
      this.renderBatchBar();
      await this.refreshList();
    } catch (err) {
      new import_obsidian6.Notice(`\u6279\u91CF\u64CD\u4F5C\u5931\u8D25\uFF1A${err.message}`);
    }
  }
  async onClose() {
  }
};

// src/ui/collection-detail.ts
var import_obsidian8 = require("obsidian");

// src/ui/manual-ai.ts
var import_obsidian7 = require("obsidian");
function buildManualTemplate(item) {
  return [
    "\u4F60\u662F\u6536\u85CF\u6574\u7406\u52A9\u624B\u3002\u6839\u636E\u4E0B\u9762\u7684\u6536\u85CF\u5185\u5BB9\uFF0C\u8F93\u51FA JSON \u6570\u7EC4\uFF0C\u5143\u7D20\u7ED3\u6784\uFF1A",
    '{"type":"suggested_tag|suggested_topic|suggested_summary|suggested_group","payload":"...","confidence":0-1}\u3002',
    "suggested_tag \u7684 payload \u4E3A\u5B57\u7B26\u4E32\u6570\u7EC4 JSON\uFF1Bsuggested_topic \u4E3A\u5355\u4E2A\u4E3B\u9898\u5B57\u7B26\u4E32\uFF1B",
    "suggested_summary \u4E3A 1-2 \u53E5\u6458\u8981\u5B57\u7B26\u4E32\uFF1Bsuggested_group \u4E3A\u6536\u85CF\u5206\u7EC4\u540D\u3002\u53EA\u8F93\u51FA JSON\uFF0C\u4E0D\u8981\u989D\u5916\u89E3\u91CA\u3002",
    "",
    `\u5DF2\u6709Tag\uFF1A${(item.tags ?? []).length > 0 ? (item.tags ?? []).join(", ") : "\u65E0"}`,
    "--- \u6536\u85CF\u5185\u5BB9 ---",
    `\u5E73\u53F0\uFF1A${item.platform}`,
    `\u6807\u9898\uFF1A${item.title}`,
    `\u4F5C\u8005\uFF1A${item.author ?? "\u672A\u77E5"}`,
    `\u94FE\u63A5\uFF1A${item.url}`,
    item.description ? `\u7B80\u4ECB\uFF1A${item.description.slice(0, 500)}` : ""
  ].filter((line) => line !== "").join("\n");
}
function openManualAIModal(app, item, source) {
  const modal = new import_obsidian7.Modal(app);
  modal.titleEl.setText("Manual \u6A21\u5F0F AI\uFF08PRD 19.3\uFF09");
  modal.contentEl.createEl("h4", { text: "1) \u590D\u5236\u6A21\u677F\u5230\u4EFB\u610F AI \u5DE5\u5177\uFF08ChatGPT/DeepSeek \u7B49\uFF09" });
  const tpl = modal.contentEl.createEl("textarea", {
    attr: { rows: "12", style: "width:100%;" }
  });
  tpl.value = buildManualTemplate(item);
  modal.contentEl.createEl("button", { text: "\u590D\u5236\u6A21\u677F", cls: "omni-btn omni-btn-sm" }).addEventListener("click", () => {
    tpl.select();
    document.execCommand("copy");
    new import_obsidian7.Notice("\u6A21\u677F\u5DF2\u590D\u5236");
  });
  modal.contentEl.createEl("h4", { text: "2) \u7C98\u8D34 AI \u8FD4\u56DE\u7684\u7ED3\u679C" });
  const reply = modal.contentEl.createEl("textarea", {
    attr: { rows: "8", style: "width:100%;" }
  });
  modal.contentEl.createEl("button", { text: "\u63D0\u4EA4\u5E76\u751F\u6210\u5EFA\u8BAE", cls: "omni-btn omni-btn-primary" }).addEventListener("click", () => {
    if (!reply.value.trim()) {
      new import_obsidian7.Notice("\u8BF7\u7C98\u8D34 AI \u56DE\u590D");
      return;
    }
    void source.submit(item.id, reply.value).then(() => {
      modal.close();
      new import_obsidian7.Notice("\u5EFA\u8BAE\u5DF2\u751F\u6210\uFF08\u8BF7\u5230 AI \u5EFA\u8BAE\u5BA1\u6838\u786E\u8BA4\uFF09");
    }).catch((e) => new import_obsidian7.Notice(`\u63D0\u4EA4\u5931\u8D25\uFF1A${e.message}`));
  });
  modal.open();
}

// src/ui/collection-detail.ts
var VIEW_TYPE_OMNI_DETAIL = "omni-collector-detail";
var PLATFORM_LABELS = {
  bilibili: "B\u7AD9",
  youtube: "YouTube",
  xiaohongshu: "\u5C0F\u7EA2\u4E66",
  makerworld: "MakerWorld",
  xiaoheihe: "\u5C0F\u9ED1\u76D2"
};
function embedUrl(item) {
  if (item.platform === "bilibili") {
    const m = /(BV[0-9A-Za-z]+)/.exec(item.url);
    return m ? `https://player.bilibili.com/player.html?bvid=${m[1]}&page=1` : null;
  }
  if (item.platform === "youtube") {
    const m = /(?:v=|youtu\.be\/|shorts\/)([0-9A-Za-z_-]{11})/.exec(item.url);
    return m ? `https://www.youtube.com/embed/${m[1]}` : null;
  }
  return null;
}
var OmniCollectionDetailView = class extends import_obsidian8.ItemView {
  constructor(leaf, source) {
    super(leaf);
    __publicField(this, "source", source);
    __publicField(this, "currentId", "");
  }
  getViewType() {
    return VIEW_TYPE_OMNI_DETAIL;
  }
  getDisplayText() {
    return "Omni Collector \u5185\u5BB9\u9884\u89C8";
  }
  getState() {
    return { collectionId: this.currentId };
  }
  async setState(state) {
    this.currentId = state.collectionId ?? "";
    await this.renderContent();
  }
  async onOpen() {
    this.currentId = this.getState().collectionId ?? "";
    await this.renderContent();
  }
  async renderContent() {
    const container = this.containerEl.children[1];
    container.empty();
    container.addClass("omni-detail");
    if (!this.currentId) {
      container.createEl("div", { text: "\u672A\u9009\u62E9\u6536\u85CF", cls: "omni-empty" });
      return;
    }
    const item = await this.source.get(this.currentId);
    if (!item) {
      container.createEl("div", { text: "\u6536\u85CF\u4E0D\u5B58\u5728", cls: "omni-empty" });
      return;
    }
    if (item.coverUrl) {
      const img = container.createEl("img", { cls: "omni-detail-cover", attr: { referrerpolicy: "no-referrer" } });
      void this.source.ensureCover(item.coverUrl).then((src) => {
        if (src) img.setAttribute("src", src);
      });
    }
    container.createEl("div", { text: item.title || item.platformItemId, cls: "omni-detail-title" });
    const meta = container.createEl("div", { cls: "omni-row-meta" });
    if (item.contentStatus === "deleted") {
      meta.createEl("span", { text: "\u5931\u6548", cls: "omni-badge omni-badge-deleted" });
    }
    meta.createEl("span", { text: PLATFORM_LABELS[item.platform] ?? item.platform, cls: "omni-badge omni-badge-platform" });
    meta.createEl("span", { text: item.author ?? "\u672A\u77E5\u4F5C\u8005", cls: "omni-badge" });
    meta.createEl("span", { text: item.contentType === "video" ? "\u89C6\u9891" : item.contentType, cls: "omni-badge" });
    meta.createEl("span", { text: new Date(item.collectedAt).toLocaleDateString("zh-CN"), cls: "omni-meta-text" });
    const embed = embedUrl(item);
    if (embed) {
      container.createEl("div", { cls: "omni-detail-player" }).createEl("iframe", {
        attr: {
          src: embed,
          allow: "fullscreen; picture-in-picture; encrypted-media",
          allowfullscreen: "",
          style: "width:100%;aspect-ratio:16/9;border:0;border-radius:8px;"
        }
      });
    } else {
      container.createEl("button", { text: "\u5728\u6D4F\u89C8\u5668\u6253\u5F00\u539F\u6587", cls: "omni-btn omni-btn-primary" }).addEventListener("click", () => {
        void window.open(item.url, "_blank");
      });
    }
    if (item.description) {
      container.createEl("div", { text: "\u7B80\u4ECB", cls: "omni-section-title" });
      container.createEl("div", { text: item.description, cls: "omni-detail-desc" });
    }
    const bodySection = container.createEl("div", { cls: "omni-detail-body" });
    const bodyBtn = bodySection.createEl("button", { text: "\u52A0\u8F7D\u6B63\u6587", cls: "omni-btn omni-btn-sm" });
    const bodyText = bodySection.createEl("div", { cls: "omni-detail-desc", attr: { style: "display:none;" } });
    bodyBtn.addEventListener("click", () => {
      bodyBtn.setText("\u52A0\u8F7D\u4E2D\u2026");
      bodyBtn.addClass("omni-btn-disabled");
      void this.source.fetchText(item.url).then((res) => {
        bodyBtn.setText("\u91CD\u65B0\u52A0\u8F7D\u6B63\u6587");
        bodyBtn.removeClass("omni-btn-disabled");
        bodyText.setText(res.text || "\u6B63\u6587\u6682\u4E0D\u53EF\u7528\uFF08\u5E73\u53F0\u9650\u5236\u6216\u9700\u91CD\u65B0\u540C\u6B65\uFF09");
        bodyText.show();
        if (res.comments && res.comments.length > 0) {
          let section = container.querySelector(".omni-detail-comments");
          if (!section) {
            container.createEl("div", { text: "\u8BC4\u8BBA", cls: "omni-section-title" });
            section = container.createEl("div", { cls: "omni-detail-comments" });
          }
          for (const c of res.comments) {
            const row = section.createEl("div", { cls: "omni-comment" });
            row.createEl("span", { text: c.author, cls: "omni-comment-author" });
            row.createEl("span", { text: c.content, cls: "omni-comment-content" });
          }
        }
      }).catch((e) => {
        bodyBtn.setText("\u52A0\u8F7D\u6B63\u6587");
        bodyBtn.removeClass("omni-btn-disabled");
        new import_obsidian8.Notice(`\u6B63\u6587\u52A0\u8F7D\u5931\u8D25\uFF1A${e.message}`);
      });
    });
    const chips = container.createEl("div", { cls: "omni-detail-chips" });
    for (const t of item.tags ?? []) chips.createEl("span", { text: `#${t}`, cls: "omni-badge omni-badge-tag" });
    for (const t of item.topics ?? []) chips.createEl("span", { text: `\u25CE${t}`, cls: "omni-badge omni-badge-topic" });
    const tagBtn = chips.createEl("button", { text: "\uFF0BTag", cls: "omni-chip" });
    tagBtn.addEventListener("click", () => this.promptText("\u6253 Tag", "\u8F93\u5165\u6807\u7B7E\u540D", (v) => this.source.onTag(item.id, v)));
    const topicBtn = chips.createEl("button", { text: "\uFF0BTopic", cls: "omni-chip" });
    topicBtn.addEventListener("click", () => this.promptText("\u5F52\u5165 Topic", "\u8F93\u5165 Topic \u540D", (v) => this.source.onTopic(item.id, v)));
    const manualBtn = chips.createEl("button", { text: "Manual AI", cls: "omni-chip" });
    manualBtn.addEventListener(
      "click",
      () => openManualAIModal(this.app, item, { submit: (id, reply) => this.source.submitManualAI(id, reply) })
    );
    if ((item.comments ?? []).length > 0) {
      container.createEl("div", { text: "\u8BC4\u8BBA", cls: "omni-section-title" });
      const comments = container.createEl("div", { cls: "omni-detail-comments" });
      for (const c of item.comments ?? []) {
        const row = comments.createEl("div", { cls: "omni-comment" });
        row.createEl("span", { text: c.author, cls: "omni-comment-author" });
        row.createEl("span", { text: c.content, cls: "omni-comment-content" });
      }
    }
    if ((item.linkedFiles ?? []).length > 0) {
      container.createEl("div", { text: "\u672C\u5730\u6587\u4EF6", cls: "omni-section-title" });
      const files = container.createEl("div", { cls: "omni-detail-files" });
      for (const f of item.linkedFiles ?? []) {
        const name = f.split(/[\\/]/).pop() ?? f;
        files.createEl("div", { text: `\u{1F4C4} ${name}`, cls: "omni-file-row", attr: { title: f } });
      }
      const openBtn = container.createEl("button", { text: "\u6253\u5F00\u7B14\u8BB0", cls: "omni-btn omni-btn-sm" });
      openBtn.addEventListener("click", () => {
        const first = (item.linkedFiles ?? [])[0];
        if (first) this.source.openLocalFile(first);
      });
    }
    if ((item.related ?? []).length > 0) {
      container.createEl("div", { text: "\u76F8\u5173\u6536\u85CF", cls: "omni-section-title" });
      const relatedBox = container.createEl("div", { cls: "omni-detail-related" });
      for (const r of item.related ?? []) {
        const row = relatedBox.createEl("div", { cls: "omni-related-row" });
        row.createEl("span", { text: PLATFORM_LABELS[r.platform] ?? r.platform, cls: "omni-badge omni-badge-platform" });
        row.createEl("span", { text: r.title || r.id, cls: "omni-related-title" });
        row.addEventListener("click", () => {
          this.currentId = r.id;
          void this.renderContent();
        });
      }
    }
    const actions = container.createEl("div", { cls: "omni-detail-actions" });
    const orgBtn = actions.createEl("button", { text: `\u6574\u7406\uFF1A${item.organizeStatus}\uFF08\u70B9\u51FB\u63A8\u8FDB\uFF09`, cls: "omni-act" });
    orgBtn.addEventListener("click", () => {
      const next = item.organizeStatus === "unorganized" ? "viewed" : item.organizeStatus === "viewed" ? "organized" : "archived";
      void this.source.onOrganize(item.id, next).then(() => {
        item.organizeStatus = next;
        orgBtn.setText(`\u6574\u7406\uFF1A${next}\uFF08\u70B9\u51FB\u63A8\u8FDB\uFF09`);
      });
    });
    const priBtn = actions.createEl("button", { text: `\u4F18\u5148\u7EA7\uFF1A${item.priority}`, cls: "omni-act omni-act-priority" });
    priBtn.addEventListener("click", () => {
      const order = ["normal", "important", "project", "knowledge"];
      const next = order[(order.indexOf(item.priority) + 1) % order.length];
      void this.source.onPriority(item.id, next).then(() => {
        item.priority = next;
        priBtn.setText(`\u4F18\u5148\u7EA7\uFF1A${next}`);
      });
    });
  }
  promptText(title, placeholder, submit) {
    const modal = new import_obsidian8.Modal(this.app);
    modal.titleEl.setText(title);
    const input = modal.contentEl.createEl("input", { type: "text", placeholder });
    const done = () => {
      if (input.value.trim()) {
        void submit(input.value.trim()).then(() => {
          modal.close();
          new import_obsidian8.Notice("\u5DF2\u4FDD\u5B58");
        }).catch((err) => new import_obsidian8.Notice(`\u4FDD\u5B58\u5931\u8D25\uFF1A${err.message}`));
      }
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") done();
    });
    modal.contentEl.createEl("button", { text: "\u786E\u5B9A", cls: "omni-btn omni-btn-primary" }).addEventListener("click", done);
    modal.open();
  }
  async onClose() {
  }
};

// src/markdown/markdown-builder.ts
var SYSTEM_START = "<!-- OMNI_SYSTEM_START -->";
var SYSTEM_END = "<!-- OMNI_SYSTEM_END -->";
function yamlString(v) {
  return JSON.stringify(String(v ?? ""));
}
function escapeTitleHash(title) {
  return (title ?? "").replace(/#/g, "\\#");
}
function sanitizeFilename(name) {
  return (name || "untitled").replace(/[\\/:*?"<>|]/g, "_").slice(0, 120);
}
var MarkdownBuilder = class {
  buildFromDTO(dto) {
    const system = [
      `title: ${yamlString(dto.title)}`,
      `platform: ${yamlString(dto.platform)}`,
      `url: ${yamlString(dto.url)}`,
      `sync_status: ${yamlString(dto.syncStatus)}`
    ].join("\n");
    const comments = (dto.comments ?? []).map((c) => `- **${c.author}**\uFF1A${c.content}`).join("\n");
    const frontmatter = this.buildFrontmatter(dto);
    const graphLinks = this.buildGraphLinks(dto);
    return [
      frontmatter,
      "---",
      "# Omni Collector System Zone",
      SYSTEM_START,
      system,
      SYSTEM_END,
      "---",
      "",
      `# ${escapeTitleHash(dto.title)}`,
      "",
      ...graphLinks ? ["## \u5173\u8054", "", graphLinks, ""] : [],
      ...dto.coverUrl ? [`![cover](${dto.coverUrl})`, ""] : [],
      ...dto.author ? [`\u4F5C\u8005\uFF1A${dto.author}`, ""] : [],
      ...dto.description ? ["## \u7B80\u4ECB", "", dto.description, ""] : [],
      ...comments ? ["## \u8BC4\u8BBA", "", comments, ""] : [],
      "## \u6574\u7406\u4E0E\u4F18\u5148\u7EA7",
      "",
      `\u4F18\u5148\u7EA7\uFF1A${dto.priority} / \u6574\u7406\u72B6\u6001\uFF1A${dto.organizeStatus}`,
      "",
      "<!-- \u4EE5\u4E0B\u4E3A\u7528\u6237\u79C1\u6709\u7F16\u8F91\u533A\uFF0C\u4EFB\u4F55\u81EA\u52A8\u5316\u903B\u8F91\u7981\u6B62\u4FEE\u6539 -->",
      "## \u6211\u7684\u7B14\u8BB0",
      "",
      "## \u7CBE\u9009\u8BC4\u8BBA",
      "",
      "## \u8BC4\u5206\u4E0E\u4F18\u5148\u7EA7",
      ""
    ].join("\n");
  }
  buildFrontmatter(dto) {
    const tags = JSON.stringify(dto.tags ?? []);
    const topics = JSON.stringify(dto.topics ?? []);
    return [
      "---",
      `platform: ${yamlString(dto.platform)}`,
      `url: ${yamlString(dto.url)}`,
      `priority: ${yamlString(dto.priority)}`,
      `organize_status: ${yamlString(dto.organizeStatus)}`,
      `tags: ${tags}`,
      `topics: ${topics}`,
      "---"
    ].join("\n");
  }
  validateMarkers(md) {
    const start = md.indexOf(SYSTEM_START);
    const end = md.indexOf(SYSTEM_END);
    return start >= 0 && end > start;
  }
  replaceSystemZone(md, dto) {
    if (!this.validateMarkers(md)) {
      throw new Error("PLUGIN_002: system zone markers missing or misordered");
    }
    const system = [
      `title: ${yamlString(dto.title)}`,
      `platform: ${yamlString(dto.platform)}`,
      `url: ${yamlString(dto.url)}`,
      `sync_status: ${yamlString(dto.syncStatus)}`
    ].join("\n");
    let out = md.replace(
      new RegExp(`${SYSTEM_START}[\\s\\S]*?${SYSTEM_END}`),
      `${SYSTEM_START}
${system}
${SYSTEM_END}`
    );
    const newFrontmatter = this.buildFrontmatter(dto);
    if (/^---\n[\s\S]*?\n---\n/.test(out)) {
      out = out.replace(/^---\n[\s\S]*?\n---\n/, `${newFrontmatter}
`);
    } else {
      out = `${newFrontmatter}
${out}`;
    }
    const markerIdx = out.indexOf(SYSTEM_END);
    if (markerIdx >= 0) {
      const head = out.slice(0, markerIdx + SYSTEM_END.length);
      let tail = out.slice(markerIdx + SYSTEM_END.length);
      tail = tail.replace(/^# .*$/m, `# ${escapeTitleHash(dto.title)}`);
      const links = this.buildGraphLinks(dto);
      const sectionRe = /^## 关联\s*$[\s\S]*?(?=^## |^# |\Z)/m;
      if (links) {
        tail = tail.replace(sectionRe, `## \u5173\u8054

${links}

`);
      } else {
        tail = tail.replace(sectionRe, "");
      }
      out = head + tail;
    }
    return out;
  }
  buildGraphLinks(dto) {
    const topicLinks = (dto.topics ?? []).map((t) => `- [[Omni Collector/Topics/${sanitizeFilename(t)}]]`).join("\n");
    const tagLinks = (dto.tags ?? []).map((t) => `- [[Omni Collector/Tags/${sanitizeFilename(t)}]]`).join("\n");
    return [topicLinks, tagLinks].filter(Boolean).join("\n");
  }
  /** Topic 聚合页（PRD 17 / 关系图谱联动）：wikilink 指向全部成员笔记。 */
  buildTopicHub(topicName, noteLinks) {
    const name = (topicName || "\u672A\u547D\u540D\u4E3B\u9898").trim();
    const links = [...new Set(noteLinks.filter(Boolean))].map((l) => `- [[${l.replace(/\.md$/i, "")}]]`).join("\n");
    return [
      "---",
      `topic: ${yamlString(name)}`,
      `tags: ["topic/${sanitizeFilename(name)}"]`,
      "---",
      "",
      `# ${name}`,
      "",
      "> \u4E3B\u9898\u805A\u5408\u9875\uFF08Omni Collector \u81EA\u52A8\u751F\u6210\uFF0C\u4FEE\u6539\u4F1A\u88AB\u8986\u76D6\uFF09",
      "",
      "## \u6536\u85CF",
      "",
      links,
      ""
    ].join("\n");
  }
  /** Tag 聚合页（PRD 16 / 关系图谱联动）：主 Tag 节点 + 成员笔记 wikilink。 */
  buildTagHub(tagName, noteLinks) {
    const name = (tagName || "\u672A\u547D\u540D\u6807\u7B7E").trim();
    const links = [...new Set(noteLinks.filter(Boolean))].map((l) => `- [[${l.replace(/\.md$/i, "")}]]`).join("\n");
    return [
      "---",
      `tags: ["${sanitizeFilename(name)}"]`,
      "---",
      "",
      `# ${name}`,
      "",
      "> \u6807\u7B7E\u805A\u5408\u9875\uFF08Omni Collector \u81EA\u52A8\u751F\u6210\uFF0C\u4FEE\u6539\u4F1A\u88AB\u8986\u76D6\uFF09",
      "",
      "## \u6536\u85CF",
      "",
      links,
      ""
    ].join("\n");
  }
  extractUserZone(md) {
    const zone = {};
    const sections = md.split(/^##\s+/m);
    for (const section of sections.slice(1)) {
      const [header, ...body] = section.split("\n");
      const content = body.join("\n").trim();
      if (header.includes("\u6211\u7684\u7B14\u8BB0")) zone.note = content;
      else if (header.includes("\u7CBE\u9009\u8BC4\u8BBA")) zone.starredComments = content;
      else if (header.includes("\u8BC4\u5206")) zone.rating = content;
      else if (header.includes("\u4F18\u5148\u7EA7")) zone.priority = content;
    }
    return zone;
  }
};

// src/ui/manual-ai-batch.ts
var import_obsidian9 = require("obsidian");
function buildManualBatchTemplate(items) {
  const list = items.map(
    (item, i) => `${i}. \u6807\u9898\uFF1A${item.title}
   \u5E73\u53F0\uFF1A${item.platform}
   \u94FE\u63A5\uFF1A${item.url}
` + (item.description ? `   \u7B80\u4ECB\uFF1A${item.description.slice(0, 300)}
` : "")
  ).join("\n");
  return [
    "\u4F60\u662F\u6536\u85CF\u6574\u7406\u52A9\u624B\u3002\u4E0B\u9762\u6709 " + items.length + " \u6761\u6536\u85CF\uFF0C\u8BF7\u9010\u6761\u8F93\u51FA JSON \u6570\u7EC4\uFF0C\u5143\u7D20\u7ED3\u6784\uFF1A",
    '[{"index":0,"suggestions":[{"type":"suggested_tag|suggested_topic|suggested_summary|suggested_group","payload":"...","confidence":0-1}]}]',
    "index \u5FC5\u987B\u4E0E\u6536\u85CF\u7F16\u53F7\u4E00\u4E00\u5BF9\u5E94\uFF080 \u5F00\u59CB\uFF09\uFF1Bsuggested_tag \u7684 payload \u4E3A\u5B57\u7B26\u4E32\u6570\u7EC4 JSON\uFF1B",
    "suggested_topic \u4E3A\u5355\u4E2A\u4E3B\u9898\u5B57\u7B26\u4E32\uFF1Bsuggested_summary \u4E3A 1-2 \u53E5\u6458\u8981\uFF1B",
    "suggested_group \u4E3A\u6536\u85CF\u5206\u7EC4\u540D\u3002\u53EA\u8F93\u51FA JSON\uFF0C\u4E0D\u8981\u989D\u5916\u89E3\u91CA\u3002",
    "",
    "--- \u6536\u85CF\u5217\u8868 ---",
    list
  ].join("\n");
}
function openManualAIBatchModal(app, items, source) {
  const modal = new import_obsidian9.Modal(app);
  modal.titleEl.setText(`Manual AI \u6279\u91CF\uFF08${items.length} \u6761\uFF09`);
  modal.contentEl.createEl("h4", { text: "1) \u590D\u5236\u6A21\u677F\u5230\u4EFB\u610F AI \u5DE5\u5177\uFF08\u4E00\u6B21\u5904\u7406\u5168\u90E8\u6536\u85CF\uFF09" });
  const tpl = modal.contentEl.createEl("textarea", {
    attr: { rows: "16", style: "width:100%;" }
  });
  tpl.value = buildManualBatchTemplate(items);
  modal.contentEl.createEl("button", { text: "\u590D\u5236\u6A21\u677F", cls: "omni-btn omni-btn-sm" }).addEventListener("click", () => {
    tpl.select();
    document.execCommand("copy");
    new import_obsidian9.Notice("\u6A21\u677F\u5DF2\u590D\u5236");
  });
  modal.contentEl.createEl("h4", { text: "2) \u7C98\u8D34 AI \u8FD4\u56DE\u7684\u6279\u91CF\u7ED3\u679C" });
  const reply = modal.contentEl.createEl("textarea", {
    attr: { rows: "10", style: "width:100%;" }
  });
  modal.contentEl.createEl("button", { text: "\u63D0\u4EA4\u5E76\u751F\u6210\u5EFA\u8BAE", cls: "omni-btn omni-btn-primary" }).addEventListener("click", () => {
    if (!reply.value.trim()) {
      new import_obsidian9.Notice("\u8BF7\u7C98\u8D34 AI \u56DE\u590D");
      return;
    }
    void source.submit(
      items.map((i) => i.id),
      reply.value
    ).then((saved) => {
      modal.close();
      new import_obsidian9.Notice(`\u6279\u91CF\u5EFA\u8BAE\u5DF2\u751F\u6210\uFF08${saved} \u6761\uFF0C\u8BF7\u5230 AI \u5EFA\u8BAE\u5BA1\u6838\u786E\u8BA4\uFF09`);
    }).catch((e) => new import_obsidian9.Notice(`\u63D0\u4EA4\u5931\u8D25\uFF1A${e.message}`));
  });
  modal.open();
}

// src/sync/sync-scheduler.ts
function nextSyncAt(input) {
  const now = input.now ?? /* @__PURE__ */ new Date();
  if (!input.lastRunAt) {
    return new Date(now.getTime() + 5 * 60 * 1e3);
  }
  const last = new Date(input.lastRunAt).getTime();
  const intervalMs = input.frequency === "weekly" ? 7 * 24 * 3600 * 1e3 : 24 * 3600 * 1e3;
  const windowMs = Math.max(0, input.randomWindowMinutes ?? 120) * 60 * 1e3;
  const offset = windowMs > 0 ? Math.floor(Math.random() * windowMs) : 0;
  return new Date(last + intervalMs + offset);
}
function isSyncDue(input) {
  return nextSyncAt(input).getTime() <= (input.now ?? /* @__PURE__ */ new Date()).getTime();
}
function dailyCapReached(todayCount, cap) {
  return todayCount >= Math.max(0, cap);
}

// src/main.ts
var OmniCollectorPlugin = class extends import_obsidian10.Plugin {
  constructor() {
    super(...arguments);
    __publicField(this, "pluginSettings");
    __publicField(this, "engine");
    __publicField(this, "autoScanTimer", null);
    __publicField(this, "syncTimer", null);
  }
  async onload() {
    this.pluginSettings = await loadSettings(this);
    if (!this.pluginSettings.dataDir) {
      const basePath = this.app.vault.adapter.getBasePath();
      this.pluginSettings.dataDir = import_node_path.default.join(basePath, ".omni-collector");
    }
    if (!this.pluginSettings.engineScript) {
      this.pluginSettings.engineScript = import_node_path.default.join(
        this.pluginSettings.dataDir,
        "engine",
        "index.js"
      );
    }
    if (!this.pluginSettings.wsToken) {
      this.pluginSettings.wsToken = (0, import_node_crypto2.randomUUID)();
    }
    await saveSettings(this, this.pluginSettings);
    this.reloadAutoScan();
    this.reloadSyncScheduler();
    this.engine = new EngineClient({
      pipePath: `\\\\.\\pipe\\omni-collector-${process.pid}`,
      wsUrl: `ws://127.0.0.1:0/?token=${this.pluginSettings.wsToken}`,
      engineScript: this.pluginSettings.engineScript,
      dataDir: this.pluginSettings.dataDir,
      nodeBin: this.pluginSettings.nodeBin || void 0,
      autoStart: this.pluginSettings.autoStartEngine
    });
    this.registerView(VIEW_TYPE_OMNI, (leaf) => new OmniSidebarView(leaf, this.engine, this.controller));
    this.registerView(VIEW_TYPE_OMNI_LIST, (leaf) => {
      const source = {
        list: () => this.engine.listCollections(),
        listLocalFiles: () => this.engine.listLocalFiles(),
        onOpenDetail: (id) => void this.openCollectionDetail(id),
        onBatch: (ids, action, value) => this.engine.batch(ids, action, value).then(() => void 0),
        getDefaultViewMode: () => this.pluginSettings.viewMode,
        onOrganize: (id, state) => this.engine.setOrganizeState(id, state).then(() => void 0),
        onTag: (id, tag) => this.engine.addTag(id, tag).then(() => void 0),
        onTopic: (id, topic) => this.engine.addTopic(id, topic).then(() => void 0),
        onPriority: (id, priority) => this.engine.setPriority(id, priority).then(() => void 0),
        onConvert: (id, to) => this.engine.convertCollection(id, to).then(() => void 0),
        ensureCover: (url) => this.ensureCover(url),
        openLocalFile: (filePath) => {
          const file = this.app.vault.getAbstractFileByPath(filePath);
          if (file) void this.app.workspace.getLeaf(false).openFile(file);
        }
      };
      return new OmniCollectionListView(leaf, source);
    });
    this.registerView(VIEW_TYPE_OMNI_DETAIL, (leaf) => {
      const source = {
        get: (id) => this.engine.getCollection(id),
        fetchText: (url) => this.engine.fetchPageText(url),
        onOrganize: (id, s) => this.engine.setOrganizeState(id, s).then(() => void 0),
        onPriority: (id, p) => this.engine.setPriority(id, p).then(() => void 0),
        onTag: (id, t) => this.engine.addTag(id, t).then(() => void 0),
        onTopic: (id, t) => this.engine.addTopic(id, t).then(() => void 0),
        openLocalFile: (filePath) => {
          const file = this.app.vault.getAbstractFileByPath(filePath);
          if (file) void this.app.workspace.getLeaf(false).openFile(file);
        },
        ensureCover: (url) => this.ensureCover(url),
        submitManualAI: (id, reply) => this.engine.submitManualAI(id, reply).then(() => void 0)
      };
      return new OmniCollectionDetailView(leaf, source);
    });
    this.registerView(VIEW_TYPE_OMNI_AI, (leaf) => {
      const source = {
        listPending: () => this.engine.listAiSuggestions(),
        review: (id, status) => this.engine.reviewAiSuggestion(id, status).then(() => void 0),
        undo: (id) => this.engine.undoAiSuggestion(id).then(() => void 0),
        openManualAI: () => void this.openManualAIPicker(),
        openManualAIBatch: () => void this.openManualAIBatchPicker()
      };
      return new OmniAiReviewView(leaf, source);
    });
    this.registerView(VIEW_TYPE_OMNI_TAGS, (leaf) => {
      const source = {
        listTags: () => this.engine.listTags(),
        addAlias: (tag, alias) => this.engine.addTagAlias(tag, alias).then(() => void 0),
        mergeTags: (sourceTag, target) => this.engine.mergeTags(sourceTag, target).then(() => void 0),
        renameTag: (tag, next) => this.engine.renameTag(tag, next).then(() => void 0),
        listTopics: () => this.engine.listTopics(),
        renameTopic: (id, name) => this.engine.renameTopic(id, name).then(() => void 0),
        listCollections: () => this.engine.listCollections(),
        openDetail: (id) => this.openCollectionDetail(id),
        refreshMarkdown: () => this.generateCollectionMarkdown()
      };
      return new OmniTagTopicView(leaf, source);
    });
    this.addSettingTab(new OmniSettingTab(this.app, this));
    this.addCommand({
      id: "open-ai-review",
      name: "\u6253\u5F00 AI \u5EFA\u8BAE\u5BA1\u6838",
      callback: () => {
        void this.openAiReviewView();
      }
    });
    this.addCommand({
      id: "open-tag-topic-manager",
      name: "\u6253\u5F00 Tag/Topic \u7BA1\u7406",
      callback: () => {
        void this.openTagTopicView();
      }
    });
    this.addCommand({
      id: "open-manual-ai",
      name: "Manual AI \u6A21\u677F\uFF08\u9009\u62E9\u6536\u85CF\uFF09",
      callback: () => {
        void this.openManualAIPicker();
      }
    });
    this.addCommand({
      id: "open-manual-ai-batch",
      name: "Manual AI \u6279\u91CF\uFF08\u6253\u5305 N \u6761\u6536\u85CF\uFF09",
      callback: () => {
        void this.openManualAIBatchPicker();
      }
    });
    this.addCommand({
      id: "run-group-recognition",
      name: "\u8FD0\u884C ContentGroup \u5173\u8054\u8BC6\u522B",
      callback: async () => {
        try {
          const res = await this.engine.runAutoGroup();
          const candidates = res.payload?.candidates ?? [];
          new import_obsidian10.Notice(`\u5206\u7EC4\u8BC6\u522B\u5B8C\u6210\uFF1A\u53D1\u73B0 ${candidates.length} \u4E2A\u5019\u9009\uFF08\u8BF7\u5230 AI \u5EFA\u8BAE\u5BA1\u6838\u786E\u8BA4\uFF09`);
        } catch (err) {
          new import_obsidian10.Notice(`\u5206\u7EC4\u8BC6\u522B\u5931\u8D25\uFF1A${err.message}`);
        }
      }
    });
    this.addCommand({
      id: "sync-all",
      name: "\u7ACB\u5373\u540C\u6B65\uFF08\u5168\u90E8\u5E73\u53F0\uFF09",
      callback: () => {
        void this.syncAllAndRender();
      }
    });
    this.addCommand({
      id: "generate-markdown",
      name: "\u751F\u6210\u6536\u85CF Markdown",
      callback: () => {
        void this.generateCollectionMarkdown();
      }
    });
    this.addCommand({
      id: "open-collection-list",
      name: "\u6253\u5F00\u6536\u85CF\u5217\u8868",
      callback: () => {
        void this.openCollectionList();
      }
    });
    this.addCommand({
      id: "scan-local-files",
      name: "\u626B\u63CF\u672C\u5730\u6587\u4EF6\u5E76\u5173\u8054\u6536\u85CF",
      callback: () => {
        void this.scanLocalFiles();
      }
    });
    this.addRibbonIcon("sparkles", "Omni Collector", () => {
      void this.activateView();
      this.engine.startEngine("query").catch((err) => new import_obsidian10.Notice(`Omni Collector: ${err.message}`));
    });
  }
  async activateView() {
    const { workspace } = this.app;
    let leaf = null;
    for (const l of workspace.getLeavesOfType(VIEW_TYPE_OMNI)) {
      leaf = l;
      break;
    }
    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      if (leaf) await leaf.setViewState({ type: VIEW_TYPE_OMNI, active: true });
    }
    if (leaf) workspace.setActiveLeaf(leaf);
  }
  onunload() {
    this.autoScanTimer = null;
    if (this.syncTimer !== null) {
      window.clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    this.engine?.dispose();
  }
  async saveSettings() {
    await saveSettings(this, this.pluginSettings);
  }
  async updateRule(key, value) {
    try {
      await this.engine.updateRule(key, value);
      new import_obsidian10.Notice(`\u5DF2\u4FDD\u5B58\uFF1A${key}`);
    } catch (err) {
      new import_obsidian10.Notice(`\u89C4\u5219\u66F4\u65B0\u5931\u8D25\uFF1A${err.message}`);
    }
  }
  /** 自动扫描定时器（设置变更后重载）。 */
  reloadAutoScan() {
    if (this.autoScanTimer !== null) {
      window.clearInterval(this.autoScanTimer);
      this.autoScanTimer = null;
    }
    if (this.pluginSettings.localAutoScan && this.pluginSettings.localFolders.length > 0) {
      this.autoScanTimer = window.setInterval(() => {
        void this.scanAllLocalFolders(true);
      }, Math.max(1, this.pluginSettings.localAutoScanMinutes) * 6e4);
    }
  }
  /** 扫描全部已配置目录。 */
  async scanAllLocalFolders(silent = false) {
    if (this.pluginSettings.localFolders.length === 0) {
      if (!silent) new import_obsidian10.Notice("\u5C1A\u672A\u52A0\u5165\u672C\u5730\u76EE\u5F55\uFF08\u8BF7\u5230\u8BBE\u7F6E\u6DFB\u52A0\uFF09");
      return;
    }
    if (!silent) new import_obsidian10.Notice("\u6B63\u5728\u626B\u63CF\u672C\u5730\u76EE\u5F55\u2026");
    let scanned = 0;
    let indexed = 0;
    let failed = 0;
    for (const folder of this.pluginSettings.localFolders) {
      try {
        const res = await this.engine.scanFolder(folder);
        const report = res.payload?.report ?? {};
        scanned += report.scanned ?? 0;
        indexed += report.indexed ?? 0;
        failed += (report.errors ?? []).length;
      } catch {
        failed += 1;
      }
    }
    if (!silent) new import_obsidian10.Notice(`\u626B\u63CF\u5B8C\u6210\uFF1A${scanned} \u4E2A\u6587\u4EF6\uFF0C\u7D22\u5F15 ${indexed} \u4E2A${failed > 0 ? `\uFF0C${failed} \u4E2A\u5931\u8D25` : ""}`);
  }
  /** 封面本地缓存：首次下载到 vault/.covers，之后走本地路径。 */
  async ensureCover(url) {
    if (!url) return null;
    const coverDir = "Omni Collector/.covers";
    const vault = this.app.vault;
    if (!await vault.adapter.exists(coverDir)) {
      await vault.createFolder(coverDir).catch(() => {
      });
    }
    const ext = /\.(jpg|jpeg|png|webp|gif)(?:[?#]|$)/i.exec(url)?.[1] ?? "jpg";
    const hash = await this.hashString(url);
    const filePath = `${coverDir}/${hash}.${ext}`;
    if (await vault.adapter.exists(filePath)) {
      const f = vault.getAbstractFileByPath(filePath);
      return f ? vault.getResourcePath(f) : url;
    }
    try {
      const res = await (0, import_obsidian10.requestUrl)({ url, method: "GET" });
      if (res.status >= 200 && res.status < 300) {
        await vault.adapter.writeBinary(filePath, res.arrayBuffer);
        const f = vault.getAbstractFileByPath(filePath);
        return f ? vault.getResourcePath(f) : url;
      }
    } catch {
    }
    return url;
  }
  async hashString(s) {
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
    return Array.from(new Uint8Array(buf)).slice(0, 12).map((b) => b.toString(16).padStart(2, "0")).join("");
  }
  get controller() {
    return {
      openCollectionList: (platform) => this.openCollectionList(platform),
      openCollectionDetail: (id) => this.openCollectionDetail(id),
      openAiReview: () => this.openAiReviewView(),
      openTagTopic: () => this.openTagTopicView(),
      openManualAI: () => this.openManualAIPicker(),
      openManualAIBatch: () => this.openManualAIBatchPicker(),
      openSettings: () => this.openSettingsTab(),
      startEngine: async () => {
        await this.engine.startEngine("query");
        new import_obsidian10.Notice("Engine \u5DF2\u542F\u52A8");
      },
      stopEngine: async () => {
        await this.engine.stopEngine("plugin");
        new import_obsidian10.Notice("Engine \u5DF2\u505C\u6B62");
      },
      syncAll: () => this.syncAllAndRender(),
      syncPlatform: async (platform) => {
        const res = await this.engine.syncPlatform(platform, this.pluginSettings.initialSyncMode);
        const report = res.payload?.report ?? {};
        if (report.status === "success") {
          new import_obsidian10.Notice(`Omni Collector: ${platform} \u6293\u53D6 ${report.itemsFetched ?? 0} \u6761\uFF08+${report.itemsAdded ?? 0} \u65B0\u589E / ${report.itemsUpdated ?? 0} \u66F4\u65B0\uFF09`);
        } else {
          new import_obsidian10.Notice(`Omni Collector: ${platform} \u540C\u6B65\u5931\u8D25 ${String(res.payload?.message ?? "")}`);
        }
      },
      deepSyncPlatform: (platform) => this.deepSyncPlatform(platform),
      refreshComments: () => this.refreshCommentsAll(),
      generateMarkdown: () => this.generateCollectionMarkdown(),
      runGroupRecognition: async () => {
        const res = await this.engine.runAutoGroup();
        const candidates = res.payload?.candidates ?? [];
        new import_obsidian10.Notice(`\u5206\u7EC4\u8BC6\u522B\u5B8C\u6210\uFF1A\u53D1\u73B0 ${candidates.length} \u4E2A\u5019\u9009\uFF08\u8BF7\u5230 AI \u5EFA\u8BAE\u5BA1\u6838\u786E\u8BA4\uFF09`);
      },
      scanLocalFiles: () => this.scanLocalFiles()
    };
  }
  updateEngineNodeBin() {
    if (!this.engine) return;
    this.engine.dispose();
    this.engine = new EngineClient({
      pipePath: `\\\\.\\pipe\\omni-collector-${process.pid}`,
      wsUrl: `ws://127.0.0.1:0/?token=${this.pluginSettings.wsToken}`,
      engineScript: this.pluginSettings.engineScript,
      dataDir: this.pluginSettings.dataDir,
      nodeBin: this.pluginSettings.nodeBin || void 0
    });
  }
  /** 自动同步调度（PRD 15.4）：每 10 分钟检查一次，按频率+随机窗口+日上限触发。 */
  reloadSyncScheduler() {
    if (this.syncTimer !== null) {
      window.clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    this.syncTimer = window.setInterval(() => void this.checkAutoSync(), 10 * 6e4);
    void this.checkAutoSync();
  }
  async checkAutoSync() {
    if (!this.pluginSettings.autoSyncEnabled) return;
    try {
      const statuses = await this.engine.listPlatformStatus();
      for (const s of statuses) {
        const frequency = this.pluginSettings.syncFrequency[s.platform] ?? "daily";
        const lastAuto = this.pluginSettings.lastAutoSyncAt[s.platform] ?? null;
        if (dailyCapReached(s.todaySyncCount, this.pluginSettings.dailySyncCapPerPlatform)) continue;
        if (!isSyncDue({ frequency, lastRunAt: lastAuto, randomWindowMinutes: this.pluginSettings.syncRandomWindowMinutes })) {
          continue;
        }
        this.pluginSettings.lastAutoSyncAt = {
          ...this.pluginSettings.lastAutoSyncAt,
          [s.platform]: (/* @__PURE__ */ new Date()).toISOString()
        };
        await this.saveSettings();
        await this.engine.syncPlatform(s.platform, "catalog").catch(() => {
        });
      }
    } catch {
    }
  }
  /** 深度历史同步：按设置的回溯深度拉取。 */
  async deepSyncPlatform(platform) {
    const depth = this.pluginSettings.deepSyncDepth;
    const res = await this.engine.syncPlatform(platform, "full", depth);
    const report = res.payload?.report ?? {};
    if (report.status === "success") {
      new import_obsidian10.Notice(`\u6DF1\u5EA6\u540C\u6B65\u5B8C\u6210\uFF1A${platform} +${report.itemsAdded ?? 0} \u65B0\u589E / ${report.itemsUpdated ?? 0} \u66F4\u65B0`);
    } else {
      new import_obsidian10.Notice(`\u6DF1\u5EA6\u540C\u6B65\u5931\u8D25\uFF1A${platform}`);
    }
  }
  /** 评论批量更新（最近 N 天）。 */
  async refreshCommentsAll() {
    new import_obsidian10.Notice("\u5F00\u59CB\u6279\u91CF\u5237\u65B0\u8BC4\u8BBA\u2026");
    try {
      const res = await this.engine.refreshComments(void 0, this.pluginSettings.commentBatchUpdateDays);
      const reports = res.payload?.reports ?? [];
      const total = reports.reduce((acc, r) => acc + r.refreshed, 0);
      new import_obsidian10.Notice(`\u8BC4\u8BBA\u5237\u65B0\u5B8C\u6210\uFF1A${total} \u6761\u66F4\u65B0\uFF08${reports.map((r) => `${r.platform} ${r.refreshed}`).join(" / ")}\uFF09`);
    } catch (err) {
      new import_obsidian10.Notice(`\u8BC4\u8BBA\u5237\u65B0\u5931\u8D25\uFF1A${err.message}`);
    }
  }
  updateEngineAutoStart() {
    if (!this.engine) return;
    this.engine.dispose();
    this.engine = new EngineClient({
      pipePath: `\\\\.\\pipe\\omni-collector-${process.pid}`,
      wsUrl: `ws://127.0.0.1:0/?token=${this.pluginSettings.wsToken}`,
      engineScript: this.pluginSettings.engineScript,
      dataDir: this.pluginSettings.dataDir,
      nodeBin: this.pluginSettings.nodeBin || void 0,
      autoStart: this.pluginSettings.autoStartEngine
    });
  }
  /** 同步全部平台，完成后生成 Markdown 并提示。 */
  async syncAllAndRender() {
    const platforms = ["bilibili", "youtube", "xiaohongshu", "makerworld", "xiaoheihe"];
    new import_obsidian10.Notice("Omni Collector: \u5F00\u59CB\u540C\u6B65\u5168\u90E8\u5E73\u53F0\u2026");
    let ok = 0;
    let fetched = 0;
    let added = 0;
    let updated = 0;
    for (const platform of platforms) {
      try {
        const res = await this.engine.syncPlatform(platform, this.pluginSettings.initialSyncMode);
        const report = res.payload?.report ?? {};
        if (report.status === "success") {
          ok += 1;
          fetched += report.itemsFetched ?? 0;
          added += report.itemsAdded ?? 0;
          updated += report.itemsUpdated ?? 0;
        }
      } catch {
      }
    }
    await this.generateCollectionMarkdown();
    new import_obsidian10.Notice(`Omni Collector: \u540C\u6B65\u5B8C\u6210 ${ok}/${platforms.length} \u5E73\u53F0\uFF0C\u5171\u6293\u53D6 ${fetched} \u6761\uFF08+${added} \u65B0\u589E / ${updated} \u66F4\u65B0\uFF09`);
  }
  /** 查询收藏并写入 vault：Omni Collector/{平台}/{标题}.md（仅更新系统区）。 */
  async generateCollectionMarkdown() {
    const collections = await this.engine.listCollections();
    const folder = "Omni Collector";
    const vault = this.app.vault;
    if (!await vault.adapter.exists(folder)) {
      await vault.createFolder(folder);
    }
    const builder = new MarkdownBuilder();
    let count = 0;
    for (const dto of collections) {
      const platformDir = `${folder}/${dto.platform}`;
      if (!await vault.adapter.exists(platformDir)) {
        await vault.createFolder(platformDir);
      }
      const safeTitle = (dto.title || dto.platformItemId).replace(/[\\/:*?"<>|]/g, "_").slice(0, 120);
      const filePath = `${platformDir}/${safeTitle}.md`;
      try {
        if (await vault.adapter.exists(filePath)) {
          const existing = await vault.adapter.read(filePath);
          if (builder.validateMarkers(existing)) {
            await vault.adapter.write(filePath, builder.replaceSystemZone(existing, dto));
            count += 1;
            continue;
          }
        }
        await vault.create(filePath, builder.buildFromDTO(dto));
        count += 1;
      } catch {
      }
    }
    const topics = await this.engine.listTopics().catch(() => []);
    if (topics.length > 0) {
      const topicDir = `${folder}/Topics`;
      if (!await vault.adapter.exists(topicDir)) {
        await vault.createFolder(topicDir).catch(() => {
        });
      }
      const byId = new Map(collections.map((c) => [c.id, c]));
      for (const topic of topics) {
        const links = (topic.collection_ids ?? []).map((id) => {
          const dto = byId.get(id);
          if (!dto) return "";
          return `Omni Collector/${dto.platform}/${sanitizeFilename(dto.title || dto.platformItemId)}`;
        }).filter(Boolean);
        const hubPath = `${topicDir}/${sanitizeFilename(topic.name)}.md`;
        try {
          const content = builder.buildTopicHub(topic.name, links);
          if (await vault.adapter.exists(hubPath)) {
            await vault.adapter.write(hubPath, content);
          } else {
            await vault.create(hubPath, content);
          }
        } catch {
        }
      }
    }
    const tags = await this.engine.listTags().catch(() => []);
    if (tags.length > 0) {
      const tagDir = `${folder}/Tags`;
      if (!await vault.adapter.exists(tagDir)) {
        await vault.createFolder(tagDir).catch(() => {
        });
      }
      for (const tag of tags) {
        const links = collections.filter((c) => (c.tags ?? []).includes(tag.name)).map((c) => `Omni Collector/${c.platform}/${sanitizeFilename(c.title || c.platformItemId)}`);
        const hubPath = `${tagDir}/${sanitizeFilename(tag.name)}.md`;
        try {
          const content = builder.buildTagHub(tag.name, links);
          if (await vault.adapter.exists(hubPath)) {
            await vault.adapter.write(hubPath, content);
          } else {
            await vault.create(hubPath, content);
          }
        } catch {
        }
      }
    }
    new import_obsidian10.Notice(`Omni Collector: \u5DF2\u751F\u6210/\u66F4\u65B0 ${count} \u4E2A Markdown`);
  }
  async openCollectionList(platform) {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_OMNI_LIST)[0] ?? null;
    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      if (leaf) await leaf.setViewState({ type: VIEW_TYPE_OMNI_LIST, active: true, state: { platform: platform ?? null } });
    } else {
      await leaf.setViewState({ type: VIEW_TYPE_OMNI_LIST, active: true, state: { platform: platform ?? null } });
    }
    if (leaf) workspace.setActiveLeaf(leaf);
  }
  async openCollectionDetail(collectionId) {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_OMNI_DETAIL)[0] ?? null;
    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      if (leaf) await leaf.setViewState({ type: VIEW_TYPE_OMNI_DETAIL, active: true, state: { collectionId } });
    } else {
      await leaf.setViewState({ type: VIEW_TYPE_OMNI_DETAIL, active: true, state: { collectionId } });
    }
    if (leaf) workspace.setActiveLeaf(leaf);
  }
  async openAiReviewView() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_OMNI_AI)[0] ?? null;
    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      if (leaf) await leaf.setViewState({ type: VIEW_TYPE_OMNI_AI, active: true });
    }
    if (leaf) workspace.setActiveLeaf(leaf);
  }
  async openTagTopicView() {
    const { workspace } = this.app;
    let leaf = workspace.getLeavesOfType(VIEW_TYPE_OMNI_TAGS)[0] ?? null;
    if (!leaf) {
      leaf = workspace.getRightLeaf(false);
      if (leaf) await leaf.setViewState({ type: VIEW_TYPE_OMNI_TAGS, active: true });
    }
    if (leaf) workspace.setActiveLeaf(leaf);
  }
  /** Manual AI 全局入口：先选收藏，再打开模板（PRD 19.3）。 */
  async openManualAIPicker() {
    const collections = await this.engine.listCollections().catch(() => []);
    const modal = new import_obsidian10.Modal(this.app);
    modal.titleEl.setText("\u9009\u62E9\u6536\u85CF\uFF08Manual AI \u6A21\u677F\uFF09");
    const search = modal.contentEl.createEl("input", {
      type: "text",
      placeholder: "\u641C\u7D22\u6807\u9898\u2026",
      attr: { style: "width:100%;margin-bottom:8px;" }
    });
    const list = modal.contentEl.createEl("div", {
      cls: "omni-list",
      attr: { style: "max-height:60vh;overflow:auto;" }
    });
    const render = (keyword = "") => {
      list.empty();
      const filtered = collections.filter((c) => (c.title || "").toLowerCase().includes(keyword.toLowerCase())).slice(0, 100);
      for (const c of filtered) {
        const row = list.createEl("div", { cls: "omni-row" });
        row.createEl("span", { text: c.title || c.id, cls: "omni-title" });
        row.addEventListener("click", () => {
          modal.close();
          openManualAIModal(this.app, c, {
            submit: (id, reply) => this.engine.submitManualAI(id, reply).then(() => void 0)
          });
        });
      }
      if (filtered.length === 0) {
        list.createEl("div", { text: "\u65E0\u5339\u914D\u6536\u85CF", cls: "omni-empty" });
      }
    };
    search.addEventListener("input", () => render(search.value));
    render();
    modal.open();
  }
  /** Manual AI 批量入口：按平台/时间段打包 N 条收藏，一次交给网页 AI。 */
  async openManualAIBatchPicker() {
    const collections = await this.engine.listCollections().catch(() => []);
    const modal = new import_obsidian10.Modal(this.app);
    modal.titleEl.setText("Manual AI \u6279\u91CF\u6253\u5305");
    const filters = modal.contentEl.createEl("div", { cls: "omni-batch-filter" });
    const platformSel = filters.createEl("select");
    platformSel.createEl("option", { text: "\u5168\u90E8\u5E73\u53F0", attr: { value: "" } });
    for (const p of ["bilibili", "youtube", "xiaohongshu", "makerworld", "xiaoheihe"]) {
      platformSel.createEl("option", { text: p, attr: { value: p } });
    }
    const daysSel = filters.createEl("select");
    for (const [label, days] of [
      ["\u6700\u8FD1 7 \u5929", 7],
      ["\u6700\u8FD1 30 \u5929", 30],
      ["\u6700\u8FD1 90 \u5929", 90],
      ["\u5168\u90E8\u65F6\u95F4", 0]
    ]) {
      daysSel.createEl("option", { text: String(label), attr: { value: String(days) } });
    }
    daysSel.value = "30";
    const maxInput = filters.createEl("input", {
      type: "number",
      attr: { value: "50", min: "1", max: "100", style: "width:70px;" }
    });
    const preview = modal.contentEl.createEl("div", { cls: "omni-total" });
    const runBtn = modal.contentEl.createEl("button", {
      text: "\u751F\u6210\u6279\u91CF\u6A21\u677F",
      cls: "omni-btn omni-btn-primary"
    });
    const pick = () => {
      const platform = platformSel.value;
      const days = Number(daysSel.value);
      const max = Math.max(1, Math.min(100, Number(maxInput.value) || 50));
      const cutoff = days > 0 ? Date.now() - days * 24 * 3600 * 1e3 : 0;
      const filtered = collections.filter((c) => (!platform || c.platform === platform) && (cutoff === 0 || new Date(c.collectedAt).getTime() >= cutoff)).sort((a, b) => {
        const rank = (x) => x.organizeStatus === "unorganized" ? 0 : x.organizeStatus === "viewed" ? 1 : 2;
        return rank(a) - rank(b) || new Date(b.collectedAt).getTime() - new Date(a.collectedAt).getTime();
      }).slice(0, max);
      preview.setText(`\u5F53\u524D\u9009\u4E2D ${filtered.length} \u6761\uFF08\u4F18\u5148\u672A\u6574\u7406\uFF09`);
      return filtered;
    };
    const refresh = () => void pick();
    platformSel.addEventListener("change", refresh);
    daysSel.addEventListener("change", refresh);
    maxInput.addEventListener("input", refresh);
    runBtn.addEventListener("click", () => {
      const items = pick();
      if (items.length === 0) {
        new import_obsidian10.Notice("\u6CA1\u6709\u7B26\u5408\u6761\u4EF6\u7684\u6536\u85CF");
        return;
      }
      modal.close();
      openManualAIBatchModal(this.app, items, {
        submit: (ids, reply) => this.engine.submitManualAIBatch(ids, reply).then((res) => Number(res.payload?.saved ?? 0))
      });
    });
    refresh();
    modal.open();
  }
  async openSettingsTab() {
    const app = this.app;
    app.setting.open();
    app.setting.openTabById("omni-collector");
  }
  /** 扫描库内文件夹（默认 Omni Collector），把 Markdown/PDF 关联到收藏。 */
  async scanLocalFiles() {
    const vaultPath = this.app.vault.adapter.getBasePath();
    const defaultFolder = `${vaultPath}/Omni Collector`;
    const modal = new import_obsidian10.Modal(this.app);
    modal.titleEl.setText("\u626B\u63CF\u672C\u5730\u6587\u4EF6");
    let folder = defaultFolder;
    new import_obsidian10.Setting(modal.contentEl).setName("\u6587\u4EF6\u5939\u8DEF\u5F84").setDesc("\u626B\u63CF\u8BE5\u76EE\u5F55\u4E0B\u7684 .md / .pdf\uFF0C\u5E76\u6309 Markdown \u7CFB\u7EDF\u533A URL \u5173\u8054\u6536\u85CF\u3002").addText(
      (text) => text.setValue(defaultFolder).onChange((v) => {
        folder = v;
      })
    );
    modal.contentEl.createEl("button", { text: "\u5F00\u59CB\u626B\u63CF", cls: "omni-btn omni-btn-primary" }).addEventListener("click", () => {
      modal.close();
      void (async () => {
        new import_obsidian10.Notice("\u6B63\u5728\u626B\u63CF\u672C\u5730\u6587\u4EF6\u2026");
        try {
          const res = await this.engine.scanFolder(folder);
          const report = res.payload?.report ?? {};
          const errors = report.errors ?? [];
          new import_obsidian10.Notice(`\u626B\u63CF\u5B8C\u6210\uFF1A\u5171 ${report.scanned ?? 0} \u4E2A\u6587\u4EF6\uFF0C\u7D22\u5F15 ${report.indexed ?? 0} \u4E2A${errors.length > 0 ? `\uFF0C${errors.length} \u4E2A\u5931\u8D25` : ""}`);
        } catch (err) {
          new import_obsidian10.Notice(`\u626B\u63CF\u5931\u8D25\uFF1A${err.message}`);
        }
      })();
    });
    modal.open();
  }
};
