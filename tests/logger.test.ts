import { Logger } from '../src/classes/logger.class';

/**
 * Tests for Readiness class
 */
async function testReadinessClass() {
    console.log('Running Readiness class tests...');
    
    // Initialize readiness class
    const logger = new Logger('Test', false);
    const loggerDebug = new Logger('Test', true);

    // Test
    logger.info('Logger info');
    logger.warn('Logger warn');
    logger.error('Logger error');
    logger.debug('Logger debug');

    // Test that debug messages are not displayed
    loggerDebug.info('Logger debug info');
    loggerDebug.warn('Logger debug warn');
    loggerDebug.error('Logger debug error');
    loggerDebug.debug('Logger debug debug');

    // Done
    console.log('Logger class tests completed.');
}

// Run the tests
testReadinessClass().catch(error => {
  console.error('❌ Test failed:', error);
}); 