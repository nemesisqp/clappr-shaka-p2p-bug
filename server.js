const DEV = process.env.NODE_ENV && process.env.NODE_ENV === 'development';

const Fs = require('fs');
const Path = require('path');
const Util = require('util');

const delay = Util.promisify((t, f) => setTimeout(f, t));


(async () => {
    const fastifyOpts = {
        logger:              DEV ? {level: 'error'} : false,
        ignoreTrailingSlash: true,
        bodyLimit:           32768,
    };
    const fastify = require('fastify')(fastifyOpts);

    const fixQueryByteRange = function (request, reply, done) {
        if (request.query['byteStart'] && request.query['byteEnd']) {
            request.headers['range'] = `bytes=${request.query['byteStart']}-${request.query['byteEnd']}`;
        }
        done();
    };

    fastify.register(require('./fastify-static'), {
        root:       Path.join(__dirname, 'static'),
        prefix:     '/static/',
        preHandler: [fixQueryByteRange],
    });

    await fastify.listen(process.env.PORT || 17001, '127.0.0.1');

    console.info(`server listening on ${fastify.server.address().port}`);
})();

