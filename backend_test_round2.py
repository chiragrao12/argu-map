#!/usr/bin/env python3
"""
Backend API tests for Scaffold app - Round 2 features
Tests AI Auto-Structure and Auto joint-grouping
"""
import requests
import json
import time

BASE_URL = "https://logic-vault-5.preview.emergentagent.com/api"

def log_test(name, passed, details=""):
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"\n{status}: {name}")
    if details:
        print(f"  Details: {details}")

def verify_uuid(value, field_name):
    """Verify that a value is a valid UUID format"""
    if not isinstance(value, str):
        return False
    parts = value.split('-')
    if len(parts) != 5:
        return False
    if len(parts[0]) != 8 or len(parts[1]) != 4 or len(parts[2]) != 4 or len(parts[3]) != 4 or len(parts[4]) != 12:
        return False
    return True

def verify_no_mongo_id(obj, path=""):
    """Recursively verify no _id field exists"""
    if isinstance(obj, dict):
        if '_id' in obj:
            return False, f"Found _id at {path}"
        for key, value in obj.items():
            result, msg = verify_no_mongo_id(value, f"{path}.{key}" if path else key)
            if not result:
                return False, msg
    elif isinstance(obj, list):
        for i, item in enumerate(obj):
            result, msg = verify_no_mongo_id(item, f"{path}[{i}]")
            if not result:
                return False, msg
    return True, ""

def test_ai_auto_structure():
    """Test 1: POST /api/ai/structure - AI Auto-Structure"""
    print("\n" + "="*80)
    print("TEST 1: POST /api/ai/structure - AI Auto-Structure")
    print("="*80)
    
    try:
        # First, seed to have a clean workspace
        print("Seeding workspace first...")
        resp = requests.post(f"{BASE_URL}/seed", json={}, timeout=10)
        if resp.status_code != 200:
            log_test("Seed before AI structure", False, f"Expected 200, got {resp.status_code}")
            return False
        print("✓ Workspace seeded")
        
        # Get initial node count
        resp = requests.get(f"{BASE_URL}/nodes", timeout=10)
        if resp.status_code != 200:
            log_test("GET nodes before AI structure", False, f"Expected 200, got {resp.status_code}")
            return False
        initial_nodes = resp.json()
        initial_count = len(initial_nodes)
        print(f"✓ Initial node count: {initial_count}")
        
        # Call AI structure endpoint
        text = "Remote work boosts productivity because people skip commutes and control their environment, but critics say it harms team collaboration."
        print(f"\nCalling POST /api/ai/structure with text:")
        print(f"  '{text}'")
        print("  (This is a REAL Claude API call, may take up to 30s)...")
        
        start = time.time()
        resp = requests.post(f"{BASE_URL}/ai/structure", json={
            "text": text
        }, timeout=40)
        elapsed = time.time() - start
        
        print(f"Response time: {elapsed:.2f}s")
        print(f"Status: {resp.status_code}")
        
        if resp.status_code != 200:
            print(f"Response body: {resp.text[:500]}")
            log_test("AI structure endpoint", False, f"Expected 200, got {resp.status_code}. Response: {resp.text[:200]}")
            return False
        
        data = resp.json()
        print(f"Response: {json.dumps(data, indent=2)}")
        
        # Verify no _id
        no_id, msg = verify_no_mongo_id(data)
        if not no_id:
            log_test("AI structure - no _id", False, msg)
            return False
        
        # Verify response structure
        if not data.get('ok'):
            log_test("AI structure - ok field", False, "ok field not true")
            return False
        
        claim_id = data.get('claim_id')
        if not claim_id or not verify_uuid(claim_id, 'claim_id'):
            log_test("AI structure - claim_id", False, f"claim_id is not a valid UUID: {claim_id}")
            return False
        
        premises_count = data.get('premises')
        if not isinstance(premises_count, int) or premises_count < 2:
            log_test("AI structure - premises count", False, f"Expected premises >= 2, got {premises_count}")
            return False
        
        objections_count = data.get('objections')
        if not isinstance(objections_count, int) or objections_count < 0:
            log_test("AI structure - objections count", False, f"Expected objections >= 0, got {objections_count}")
            return False
        
        print(f"✓ Response valid: ok=true, claim_id={claim_id}, premises={premises_count}, objections={objections_count}")
        
        log_test("AI structure endpoint response", True, f"Got claim_id={claim_id}, premises={premises_count}, objections={objections_count} in {elapsed:.2f}s")
        
        # Now GET /api/nodes and verify the created nodes
        print("\nVerifying created nodes...")
        resp = requests.get(f"{BASE_URL}/nodes", timeout=10)
        if resp.status_code != 200:
            log_test("GET nodes after AI structure", False, f"Expected 200, got {resp.status_code}")
            return False
        
        all_nodes = resp.json()
        print(f"Total nodes now: {len(all_nodes)}")
        
        # Find the new claim node
        claim_node = next((n for n in all_nodes if n.get('id') == claim_id), None)
        if not claim_node:
            log_test("Verify claim node exists", False, f"Claim node with id {claim_id} not found")
            return False
        
        if claim_node.get('type') != 'claim':
            log_test("Verify claim node type", False, f"Expected type 'claim', got '{claim_node.get('type')}'")
            return False
        
        claim_outline = claim_node.get('outline_number')
        if not claim_outline or not claim_outline.startswith('1.'):
            log_test("Verify claim outline_number", False, f"Expected outline_number like '1.x', got '{claim_outline}'")
            return False
        
        print(f"✓ Claim node found: id={claim_id}, outline_number={claim_outline}, title='{claim_node.get('title')}'")
        
        log_test("Verify claim node", True, f"Claim node exists with outline_number {claim_outline}")
        
        # Find premise nodes with parent_id == claim_id
        premise_nodes = [n for n in all_nodes if n.get('type') == 'premise' and n.get('parent_id') == claim_id]
        print(f"✓ Found {len(premise_nodes)} premise nodes with parent_id={claim_id}")
        
        if len(premise_nodes) < 2:
            log_test("Verify premise nodes count", False, f"Expected >= 2 premise nodes, got {len(premise_nodes)}")
            return False
        
        # Verify all premises have outline_number like "2.x"
        for i, premise in enumerate(premise_nodes):
            outline = premise.get('outline_number')
            if not outline or not outline.startswith('2.'):
                log_test(f"Verify premise {i+1} outline_number", False, f"Expected outline_number like '2.x', got '{outline}'")
                return False
            print(f"  Premise {i+1}: outline_number={outline}, title='{premise.get('title')}'")
        
        log_test("Verify premise nodes", True, f"Found {len(premise_nodes)} premise nodes with correct outline_numbers and parent_id")
        
        # Now GET /api/edges and verify joint_group_id
        print("\nVerifying edges and joint_group_id...")
        resp = requests.get(f"{BASE_URL}/edges", timeout=10)
        if resp.status_code != 200:
            log_test("GET edges after AI structure", False, f"Expected 200, got {resp.status_code}")
            return False
        
        all_edges = resp.json()
        print(f"Total edges: {len(all_edges)}")
        
        # Find all supports edges targeting the claim
        supports_edges = [e for e in all_edges if e.get('relation') == 'supports' and e.get('target_id') == claim_id]
        print(f"✓ Found {len(supports_edges)} supports edges targeting claim {claim_id}")
        
        if len(supports_edges) != premises_count:
            log_test("Verify supports edges count", False, f"Expected {premises_count} supports edges, got {len(supports_edges)}")
            return False
        
        # Verify ALL supports edges share the SAME non-null joint_group_id
        joint_group_ids = [e.get('joint_group_id') for e in supports_edges]
        print(f"  joint_group_ids: {joint_group_ids}")
        
        # Check all are non-null
        if any(jg is None for jg in joint_group_ids):
            log_test("Verify joint_group_id non-null", False, f"Some supports edges have null joint_group_id: {joint_group_ids}")
            return False
        
        # Check all are equal
        first_jg = joint_group_ids[0]
        if not all(jg == first_jg for jg in joint_group_ids):
            log_test("Verify joint_group_id equality", False, f"Supports edges have different joint_group_ids: {joint_group_ids}")
            return False
        
        print(f"✓ All {len(supports_edges)} supports edges share the same joint_group_id: {first_jg}")
        
        log_test("Verify supports edges joint_group_id", True, f"All {len(supports_edges)} supports edges share joint_group_id={first_jg}")
        
        # If objections were created, verify objects_to edges have joint_group_id null
        if objections_count > 0:
            print(f"\nVerifying {objections_count} objection edges...")
            objection_nodes = [n for n in all_nodes if n.get('type') == 'objection' and n.get('parent_id') == claim_id]
            print(f"✓ Found {len(objection_nodes)} objection nodes with parent_id={claim_id}")
            
            objects_to_edges = [e for e in all_edges if e.get('relation') == 'objects_to' and e.get('target_id') == claim_id]
            print(f"✓ Found {len(objects_to_edges)} objects_to edges targeting claim {claim_id}")
            
            for i, edge in enumerate(objects_to_edges):
                jg = edge.get('joint_group_id')
                if jg is not None:
                    log_test(f"Verify objects_to edge {i+1} joint_group_id", False, f"Expected null joint_group_id, got {jg}")
                    return False
                print(f"  objects_to edge {i+1}: joint_group_id=null ✓")
            
            log_test("Verify objects_to edges joint_group_id", True, f"All {len(objects_to_edges)} objects_to edges have joint_group_id=null")
        else:
            print("\n✓ No objections created (objections=0)")
        
        print("\n" + "="*80)
        print("✅ TEST 1 PASSED: AI Auto-Structure working correctly")
        print("="*80)
        
        return True
        
    except requests.exceptions.Timeout:
        log_test("AI structure", False, "Request timed out after 40s")
        return False
    except Exception as e:
        log_test("AI structure", False, f"Exception: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

def test_auto_joint_grouping():
    """Test 2: Auto joint-grouping on POST /api/edges"""
    print("\n" + "="*80)
    print("TEST 2: Auto joint-grouping on POST /api/edges")
    print("="*80)
    
    try:
        # Step 1: POST /api/seed to reset workspace
        print("\nStep 1: Seeding workspace...")
        resp = requests.post(f"{BASE_URL}/seed", json={}, timeout=10)
        if resp.status_code != 200:
            log_test("Seed for joint-grouping test", False, f"Expected 200, got {resp.status_code}")
            return False
        print("✓ Workspace seeded")
        
        # Step 2: GET /api/nodes to find the seeded claim (outline_number "1.1", title "AI will transform knowledge work")
        print("\nStep 2: Finding seeded claim node...")
        resp = requests.get(f"{BASE_URL}/nodes", timeout=10)
        if resp.status_code != 200:
            log_test("GET nodes for joint-grouping test", False, f"Expected 200, got {resp.status_code}")
            return False
        
        nodes = resp.json()
        claim_1_1 = next((n for n in nodes if n.get('outline_number') == '1.1' and 'AI will transform knowledge work' in n.get('title', '')), None)
        
        if not claim_1_1:
            log_test("Find claim 1.1", False, "Claim with outline_number '1.1' and title 'AI will transform knowledge work' not found")
            return False
        
        claim_id = claim_1_1.get('id')
        print(f"✓ Found claim 1.1: id={claim_id}, title='{claim_1_1.get('title')}'")
        
        # Step 3: Create two new premise nodes
        print("\nStep 3: Creating two new premise nodes...")
        
        resp = requests.post(f"{BASE_URL}/nodes", json={
            "type": "premise",
            "title": "Extra premise A"
        }, timeout=10)
        
        if resp.status_code != 200:
            log_test("Create premise A", False, f"Expected 200, got {resp.status_code}")
            return False
        
        premise_a = resp.json()
        premise_a_id = premise_a.get('id')
        print(f"✓ Created premise A: id={premise_a_id}")
        
        resp = requests.post(f"{BASE_URL}/nodes", json={
            "type": "premise",
            "title": "Extra premise B"
        }, timeout=10)
        
        if resp.status_code != 200:
            log_test("Create premise B", False, f"Expected 200, got {resp.status_code}")
            return False
        
        premise_b = resp.json()
        premise_b_id = premise_b.get('id')
        print(f"✓ Created premise B: id={premise_b_id}")
        
        # Step 4: POST two supports edges to the claim
        print("\nStep 4: Creating supports edges from premises to claim 1.1...")
        
        resp = requests.post(f"{BASE_URL}/edges", json={
            "source_id": premise_a_id,
            "target_id": claim_id,
            "relation": "supports"
        }, timeout=10)
        
        if resp.status_code != 200:
            log_test("Create supports edge A", False, f"Expected 200, got {resp.status_code}")
            return False
        
        edge_a = resp.json()
        print(f"✓ Created supports edge A: id={edge_a.get('id')}")
        
        resp = requests.post(f"{BASE_URL}/edges", json={
            "source_id": premise_b_id,
            "target_id": claim_id,
            "relation": "supports"
        }, timeout=10)
        
        if resp.status_code != 200:
            log_test("Create supports edge B", False, f"Expected 200, got {resp.status_code}")
            return False
        
        edge_b = resp.json()
        print(f"✓ Created supports edge B: id={edge_b.get('id')}")
        
        # Step 5: GET /api/edges and verify all supports edges to claim 1.1 share ONE joint_group_id
        print("\nStep 5: Verifying joint_group_id for all supports edges to claim 1.1...")
        resp = requests.get(f"{BASE_URL}/edges", timeout=10)
        if resp.status_code != 200:
            log_test("GET edges for joint-grouping verification", False, f"Expected 200, got {resp.status_code}")
            return False
        
        all_edges = resp.json()
        
        # Find all supports edges targeting claim 1.1
        supports_to_claim = [e for e in all_edges if e.get('relation') == 'supports' and e.get('target_id') == claim_id]
        print(f"✓ Found {len(supports_to_claim)} supports edges targeting claim 1.1")
        
        # Should be 4 total: 2 seeded + 2 new
        if len(supports_to_claim) != 4:
            log_test("Verify supports edges count", False, f"Expected 4 supports edges (2 seeded + 2 new), got {len(supports_to_claim)}")
            return False
        
        # Verify all have the same non-null joint_group_id
        joint_group_ids = [e.get('joint_group_id') for e in supports_to_claim]
        print(f"  joint_group_ids: {joint_group_ids}")
        
        # Check all are non-null
        if any(jg is None for jg in joint_group_ids):
            log_test("Verify joint_group_id non-null", False, f"Some supports edges have null joint_group_id: {joint_group_ids}")
            return False
        
        # Check all are equal
        first_jg = joint_group_ids[0]
        if not all(jg == first_jg for jg in joint_group_ids):
            log_test("Verify joint_group_id equality", False, f"Supports edges have different joint_group_ids: {joint_group_ids}")
            return False
        
        print(f"✓ All {len(supports_to_claim)} supports edges share the same joint_group_id: {first_jg}")
        
        log_test("Verify auto joint-grouping", True, f"All {len(supports_to_claim)} supports edges (2 seeded + 2 new) share joint_group_id={first_jg}")
        
        # Step 6: Negative case - single supports edge should have null joint_group_id
        print("\nStep 6: Testing negative case (single supports edge)...")
        
        # Create a fresh claim
        resp = requests.post(f"{BASE_URL}/nodes", json={
            "type": "claim",
            "title": "Solo claim"
        }, timeout=10)
        
        if resp.status_code != 200:
            log_test("Create solo claim", False, f"Expected 200, got {resp.status_code}")
            return False
        
        solo_claim = resp.json()
        solo_claim_id = solo_claim.get('id')
        print(f"✓ Created solo claim: id={solo_claim_id}")
        
        # Create one premise
        resp = requests.post(f"{BASE_URL}/nodes", json={
            "type": "premise",
            "title": "Solo premise"
        }, timeout=10)
        
        if resp.status_code != 200:
            log_test("Create solo premise", False, f"Expected 200, got {resp.status_code}")
            return False
        
        solo_premise = resp.json()
        solo_premise_id = solo_premise.get('id')
        print(f"✓ Created solo premise: id={solo_premise_id}")
        
        # Create single supports edge
        resp = requests.post(f"{BASE_URL}/edges", json={
            "source_id": solo_premise_id,
            "target_id": solo_claim_id,
            "relation": "supports"
        }, timeout=10)
        
        if resp.status_code != 200:
            log_test("Create solo supports edge", False, f"Expected 200, got {resp.status_code}")
            return False
        
        solo_edge = resp.json()
        print(f"✓ Created solo supports edge: id={solo_edge.get('id')}")
        
        # GET edges and verify this edge has null joint_group_id
        resp = requests.get(f"{BASE_URL}/edges", timeout=10)
        if resp.status_code != 200:
            log_test("GET edges for solo edge verification", False, f"Expected 200, got {resp.status_code}")
            return False
        
        all_edges = resp.json()
        solo_supports_edges = [e for e in all_edges if e.get('relation') == 'supports' and e.get('target_id') == solo_claim_id]
        
        if len(solo_supports_edges) != 1:
            log_test("Verify solo supports edge count", False, f"Expected 1 supports edge to solo claim, got {len(solo_supports_edges)}")
            return False
        
        solo_jg = solo_supports_edges[0].get('joint_group_id')
        if solo_jg is not None:
            log_test("Verify solo edge joint_group_id is null", False, f"Expected null joint_group_id for single supports edge, got {solo_jg}")
            return False
        
        print(f"✓ Solo supports edge has joint_group_id=null (correct for single edge)")
        
        log_test("Verify negative case (single edge)", True, "Single supports edge correctly has joint_group_id=null")
        
        print("\n" + "="*80)
        print("✅ TEST 2 PASSED: Auto joint-grouping working correctly")
        print("="*80)
        
        return True
        
    except Exception as e:
        log_test("Auto joint-grouping", False, f"Exception: {str(e)}")
        import traceback
        traceback.print_exc()
        return False

def main():
    print("\n" + "="*80)
    print("SCAFFOLD BACKEND API TEST SUITE - ROUND 2")
    print("="*80)
    print(f"Base URL: {BASE_URL}")
    print("="*80)
    
    results = {}
    
    # Test 1: AI Auto-Structure
    results['ai_auto_structure'] = test_ai_auto_structure()
    
    # Test 2: Auto joint-grouping
    results['auto_joint_grouping'] = test_auto_joint_grouping()
    
    # Summary
    print("\n" + "="*80)
    print("TEST SUMMARY - ROUND 2")
    print("="*80)
    
    passed = sum(1 for v in results.values() if v)
    total = len(results)
    
    for test_name, result in results.items():
        status = "✅ PASS" if result else "❌ FAIL"
        print(f"{status}: {test_name}")
    
    print("="*80)
    print(f"TOTAL: {passed}/{total} tests passed")
    print("="*80)
    
    return passed == total

if __name__ == "__main__":
    success = main()
    exit(0 if success else 1)
