import { Readiness } from '../src/classes/readiness.class';

/**
 * Tests for Readiness class
 */
async function testReadinessClass() {
    console.log('Running Readiness class tests...');
    
    // Initialize readiness class
    const readiness = new Readiness();
    
    // Test that system
    const waiter = async (index: number) => {
        const startTime = Date.now();
        console.log(`Waiter ${index}`, `Waiting for system to be ready...`);
        await readiness.isReady();
        const endTime = Date.now();
        console.log(`Waiter ${index}`, `System is ready! Time taken: ${endTime - startTime}ms`);
    }

    // Test that system starts as not ready
    waiter(1);

    // Wait for 3 seconds and set system as ready
    await new Promise(resolve => setTimeout(resolve, 3_000));
    readiness.setReady();

    // Wait for 1 second and set system as not ready
    await new Promise(resolve => setTimeout(resolve, 1_000));
    readiness.setNotReady();

    // Launch 3 waiters
    waiter(2);
    waiter(3);
    waiter(4);

    // Wait for 2 seconds and set system as not ready
    await new Promise(resolve => setTimeout(resolve, 2_000));
    readiness.setReady();

    // Done
    await new Promise(resolve => setTimeout(resolve, 1_000));
    console.log('Readiness class tests completed.');
}

// Run the tests
testReadinessClass().catch(error => {
  console.error('❌ Test failed:', error);
}); 