const Frequency = require('./frequency');
const Duration = require('./duration');

module.exports = (note) => {
	const inputDuration = note[0];
    const inputFrequency = note[1];
    const fx = note[2] || [];

    const noteSchema = {
	    inputDuration,
	    inputFrequency,
	    outputDuration: Duration[inputDuration],
	    outputFrequency: Frequency[inputFrequency],
	    fx: {
	        all: fx,
	        slide: fx.includes('slide'),

	    }
    }
    
	return noteSchema
}