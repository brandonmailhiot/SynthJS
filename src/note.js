const Frequency = require('./frequency');
const Duration = require('./duration');

module.exports = (note) => {
	const inputDuration = note[0];
    const inputFrequency = note[1];
    const fx = note[2] || [];
    const slide = fx.includes('slide')
    const poly = fx.includes('poly')

    const noteSchema = {
	    inputDuration,
	    inputFrequency,
	    outputDuration: Duration[inputDuration],
	    outputFrequency: (() => {
	    	return poly 
	    		? inputFrequency.split(' ').map(f => Frequency[f])
	    		: [Frequency[inputFrequency]]
	    })(),
	    fx: {
	        all: fx,
	        slide,
	        poly
	    }
    }
    
	return noteSchema
}