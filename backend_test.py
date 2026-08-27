#!/usr/bin/env python3
"""
Backend API Test Suite for Scaffold App - Round 3
Tests two new AI endpoints: /api/ai/rebuttal and /api/ai/summarize
"""
import requests
import time
import sys

# Base URL from .env
BASE_URL = "https://logic-vault-5.preview.emergentagent.com/api"

def test_ai_rebuttal():
    """
    Test POST /api/ai/rebuttal endpoint
    - Find seeded objection node (outline_number "2.3", title "Hallucinations limit reliability")
    - POST rebuttal with objection node_id
    - Verify response has node_id, title, content, outline_number
    - Verify new premise node exists with parent_id == objection id
    - Verify new objects_to edge exists with source_id == new node_id, target_id == objection id
    - Test negative case: non-existent node_id should return 404
    """
    print("\n" + "="*80)
    print("TEST 1: AI REBUTTAL - POST /api/ai/rebuttal")
    print("="*80)
    
    try:
        # Step 1: Seed the workspace
        print("\n[1/7] Seeding workspace...")
        seed_resp = requests.post(f"{BASE_URL}/seed", json={}, timeout=30)
        if seed_resp.status_code != 200:
            print(f"❌ FAIL: Seed failed with status {seed_resp.status_code}")
            return False
        seed_data = seed_resp.json()
        print(f"✅ Seed successful: {seed_data.get('nodes')} nodes, {seed_data.get('edges')} edges")
        
        # Step 2: Get all nodes to find the objection
        print("\n[2/7] Fetching nodes to find objection '2.3'...")
        nodes_resp = requests.get(f"{BASE_URL}/nodes", timeout=10)
        if nodes_resp.status_code != 200:
            print(f"❌ FAIL: GET /api/nodes failed with status {nodes_resp.status_code}")
            return False
        nodes = nodes_resp.json()
        print(f"✅ Fetched {len(nodes)} nodes")
        
        # Find the objection node with outline_number "2.3" and title containing "Hallucinations"
        objection = None
        for node in nodes:
            if node.get('outline_number') == '2.3' and 'Hallucinations' in node.get('title', ''):
                objection = node
                break
        
        if not objection:
            print(f"❌ FAIL: Could not find objection node with outline_number '2.3' and title containing 'Hallucinations'")
            print(f"Available nodes: {[(n.get('outline_number'), n.get('title'), n.get('type')) for n in nodes]}")
            return False
        
        print(f"✅ Found objection: id={objection['id']}, title='{objection['title']}', outline_number={objection['outline_number']}")
        
        # Step 3: POST rebuttal (real Claude API call, allow ~25s)
        print(f"\n[3/7] Calling POST /api/ai/rebuttal with node_id={objection['id']} (real Claude call, ~25s)...")
        start_time = time.time()
        rebuttal_resp = requests.post(
            f"{BASE_URL}/ai/rebuttal",
            json={"node_id": objection['id']},
            timeout=35
        )
        elapsed = time.time() - start_time
        
        if rebuttal_resp.status_code != 200:
            print(f"❌ FAIL: POST /api/ai/rebuttal failed with status {rebuttal_resp.status_code}")
            print(f"Response: {rebuttal_resp.text}")
            return False
        
        rebuttal_data = rebuttal_resp.json()
        print(f"✅ Rebuttal created in {elapsed:.2f}s")
        print(f"   Response: node_id={rebuttal_data.get('node_id')}, title='{rebuttal_data.get('title')}', outline_number={rebuttal_data.get('outline_number')}")
        
        # Verify response structure
        required_fields = ['node_id', 'title', 'content', 'outline_number']
        for field in required_fields:
            if field not in rebuttal_data:
                print(f"❌ FAIL: Response missing required field '{field}'")
                return False
        
        new_node_id = rebuttal_data['node_id']
        new_outline = rebuttal_data['outline_number']
        
        # Verify outline_number format (should be like "3.x")
        if not new_outline or not new_outline.startswith('3.'):
            print(f"❌ FAIL: Expected outline_number to start with '3.', got '{new_outline}'")
            return False
        print(f"✅ Outline number format correct: {new_outline}")
        
        # Step 4: Verify new node exists in database
        print(f"\n[4/7] Verifying new premise node exists with id={new_node_id}...")
        nodes_resp2 = requests.get(f"{BASE_URL}/nodes", timeout=10)
        if nodes_resp2.status_code != 200:
            print(f"❌ FAIL: GET /api/nodes failed")
            return False
        
        nodes2 = nodes_resp2.json()
        new_node = None
        for node in nodes2:
            if node.get('id') == new_node_id:
                new_node = node
                break
        
        if not new_node:
            print(f"❌ FAIL: New node with id={new_node_id} not found in database")
            return False
        
        print(f"✅ New node found: type={new_node.get('type')}, parent_id={new_node.get('parent_id')}, outline_number={new_node.get('outline_number')}")
        
        # Verify node properties
        if new_node.get('type') != 'premise':
            print(f"❌ FAIL: Expected type='premise', got '{new_node.get('type')}'")
            return False
        
        if new_node.get('parent_id') != objection['id']:
            print(f"❌ FAIL: Expected parent_id={objection['id']}, got {new_node.get('parent_id')}")
            return False
        
        if new_node.get('outline_number') != new_outline:
            print(f"❌ FAIL: Expected outline_number={new_outline}, got {new_node.get('outline_number')}")
            return False
        
        print(f"✅ Node properties verified: type='premise', parent_id={objection['id']}, outline_number={new_outline}")
        
        # Step 5: Verify objects_to edge exists
        print(f"\n[5/7] Verifying objects_to edge exists...")
        edges_resp = requests.get(f"{BASE_URL}/edges", timeout=10)
        if edges_resp.status_code != 200:
            print(f"❌ FAIL: GET /api/edges failed")
            return False
        
        edges = edges_resp.json()
        rebuttal_edge = None
        for edge in edges:
            if edge.get('source_id') == new_node_id and edge.get('target_id') == objection['id']:
                rebuttal_edge = edge
                break
        
        if not rebuttal_edge:
            print(f"❌ FAIL: No edge found with source_id={new_node_id} and target_id={objection['id']}")
            return False
        
        print(f"✅ Edge found: id={rebuttal_edge.get('id')}, relation={rebuttal_edge.get('relation')}, style={rebuttal_edge.get('style')}")
        
        # Verify edge properties
        if rebuttal_edge.get('relation') != 'objects_to':
            print(f"❌ FAIL: Expected relation='objects_to', got '{rebuttal_edge.get('relation')}'")
            return False
        
        if rebuttal_edge.get('style') != 'dashed':
            print(f"❌ FAIL: Expected style='dashed', got '{rebuttal_edge.get('style')}'")
            return False
        
        print(f"✅ Edge properties verified: relation='objects_to', style='dashed'")
        
        # Step 6: Test negative case - non-existent node_id
        print(f"\n[6/7] Testing negative case: non-existent node_id...")
        neg_resp = requests.post(
            f"{BASE_URL}/ai/rebuttal",
            json={"node_id": "does-not-exist"},
            timeout=10
        )
        
        if neg_resp.status_code != 404:
            print(f"❌ FAIL: Expected 404 for non-existent node_id, got {neg_resp.status_code}")
            return False
        
        print(f"✅ Negative case passed: non-existent node_id returns 404")
        
        # Step 7: Verify no Mongo _id in responses
        print(f"\n[7/7] Verifying no Mongo _id in responses...")
        if '_id' in rebuttal_data:
            print(f"❌ FAIL: Found Mongo _id in rebuttal response")
            return False
        if '_id' in new_node:
            print(f"❌ FAIL: Found Mongo _id in node response")
            return False
        if '_id' in rebuttal_edge:
            print(f"❌ FAIL: Found Mongo _id in edge response")
            return False
        
        print(f"✅ No Mongo _id found in any response")
        
        print("\n" + "="*80)
        print("✅ TEST 1 PASSED: AI REBUTTAL")
        print("="*80)
        return True
        
    except Exception as e:
        print(f"\n❌ TEST 1 FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_ai_summarize():
    """
    Test POST /api/ai/summarize endpoint
    - Get two note ids: "Reading list" and "Productivity gains"
    - POST summarize with node_ids array
    - Verify response has summary (non-empty string) and count=2
    - Test negative case: empty node_ids should return 400
    """
    print("\n" + "="*80)
    print("TEST 2: AI CLUSTER SUMMARIZE - POST /api/ai/summarize")
    print("="*80)
    
    try:
        # Step 1: Get all nodes to find the two notes
        print("\n[1/4] Fetching nodes to find notes 'Reading list' and 'Productivity gains'...")
        nodes_resp = requests.get(f"{BASE_URL}/nodes", timeout=10)
        if nodes_resp.status_code != 200:
            print(f"❌ FAIL: GET /api/nodes failed with status {nodes_resp.status_code}")
            return False
        
        nodes = nodes_resp.json()
        print(f"✅ Fetched {len(nodes)} nodes")
        
        # Find the two note nodes
        reading_list = None
        productivity_gains = None
        
        for node in nodes:
            if node.get('type') == 'note' and 'Reading list' in node.get('title', ''):
                reading_list = node
            if node.get('type') == 'note' and 'Productivity gains' in node.get('title', ''):
                productivity_gains = node
        
        if not reading_list:
            print(f"❌ FAIL: Could not find note with title 'Reading list'")
            print(f"Available notes: {[(n.get('title'), n.get('type')) for n in nodes if n.get('type') == 'note']}")
            return False
        
        if not productivity_gains:
            print(f"❌ FAIL: Could not find note with title 'Productivity gains'")
            print(f"Available notes: {[(n.get('title'), n.get('type')) for n in nodes if n.get('type') == 'note']}")
            return False
        
        print(f"✅ Found notes:")
        print(f"   - Reading list: id={reading_list['id']}")
        print(f"   - Productivity gains: id={productivity_gains['id']}")
        
        # Step 2: POST summarize (real Claude API call, allow ~25s)
        node_ids = [reading_list['id'], productivity_gains['id']]
        print(f"\n[2/4] Calling POST /api/ai/summarize with {len(node_ids)} node_ids (real Claude call, ~25s)...")
        start_time = time.time()
        summarize_resp = requests.post(
            f"{BASE_URL}/ai/summarize",
            json={"node_ids": node_ids},
            timeout=35
        )
        elapsed = time.time() - start_time
        
        if summarize_resp.status_code != 200:
            print(f"❌ FAIL: POST /api/ai/summarize failed with status {summarize_resp.status_code}")
            print(f"Response: {summarize_resp.text}")
            return False
        
        summarize_data = summarize_resp.json()
        print(f"✅ Summary generated in {elapsed:.2f}s")
        
        # Verify response structure
        if 'summary' not in summarize_data:
            print(f"❌ FAIL: Response missing 'summary' field")
            return False
        
        if 'count' not in summarize_data:
            print(f"❌ FAIL: Response missing 'count' field")
            return False
        
        summary = summarize_data['summary']
        count = summarize_data['count']
        
        print(f"   Summary length: {len(summary)} chars")
        print(f"   Count: {count}")
        print(f"   Summary preview: {summary[:150]}...")
        
        # Verify summary is non-empty
        if not summary or len(summary) == 0:
            print(f"❌ FAIL: Summary is empty")
            return False
        
        print(f"✅ Summary is non-empty ({len(summary)} chars)")
        
        # Verify count is 2
        if count != 2:
            print(f"❌ FAIL: Expected count=2, got {count}")
            return False
        
        print(f"✅ Count is correct: {count}")
        
        # Step 3: Test negative case - empty node_ids
        print(f"\n[3/4] Testing negative case: empty node_ids...")
        neg_resp = requests.post(
            f"{BASE_URL}/ai/summarize",
            json={"node_ids": []},
            timeout=10
        )
        
        if neg_resp.status_code != 400:
            print(f"❌ FAIL: Expected 400 for empty node_ids, got {neg_resp.status_code}")
            return False
        
        neg_data = neg_resp.json()
        if 'error' not in neg_data:
            print(f"❌ FAIL: Expected error message in response for empty node_ids")
            return False
        
        print(f"✅ Negative case passed: empty node_ids returns 400 with error: '{neg_data.get('error')}'")
        
        # Step 4: Verify no Mongo _id in response
        print(f"\n[4/4] Verifying no Mongo _id in response...")
        if '_id' in summarize_data:
            print(f"❌ FAIL: Found Mongo _id in summarize response")
            return False
        
        print(f"✅ No Mongo _id found in response")
        
        print("\n" + "="*80)
        print("✅ TEST 2 PASSED: AI CLUSTER SUMMARIZE")
        print("="*80)
        return True
        
    except Exception as e:
        print(f"\n❌ TEST 2 FAILED with exception: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    """Run all backend tests"""
    print("\n" + "="*80)
    print("SCAFFOLD APP - BACKEND API TEST SUITE (ROUND 3)")
    print("Testing 2 new AI endpoints: /api/ai/rebuttal and /api/ai/summarize")
    print("="*80)
    
    results = []
    
    # Test 1: AI Rebuttal
    results.append(("AI Rebuttal", test_ai_rebuttal()))
    
    # Test 2: AI Cluster Summarize
    results.append(("AI Cluster Summarize", test_ai_summarize()))
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY")
    print("="*80)
    
    passed = sum(1 for _, result in results if result)
    total = len(results)
    
    for name, result in results:
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {name}")
    
    print(f"\nTotal: {passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 ALL TESTS PASSED!")
        return 0
    else:
        print(f"\n⚠️  {total - passed} test(s) failed")
        return 1


if __name__ == "__main__":
    sys.exit(main())
